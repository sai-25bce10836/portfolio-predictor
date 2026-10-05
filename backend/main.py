import logging
from typing import Optional, Dict, Any, List
from fastapi import FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Local module imports
from config import settings
from broker_sync import fetch_upstox_holdings, fetch_dhan_holdings, exchange_upstox_code
from ml_engine import PortfolioMLEngine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("quant_terminal")

app = FastAPI(
    title="Quantitative ML Portfolio Terminal API",
    version="1.0.0",
    description="Stateless broker sync & ML T+1 NAV prediction engine for Indian stock portfolios."
)

# Enforce strict CORS matching FRONTEND_URL in settings
origins = [settings.FRONTEND_URL] if getattr(settings, "FRONTEND_URL", None) else ["http://localhost:3000", "http://127.0.0.1:5500"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Request & Response Schemas ---

class SyncAndAnalyzeRequest(BaseModel):
    broker: str = Field(..., description="Broker identifier: 'upstox' or 'dhan'")
    access_token: str = Field(..., description="OAuth Access Token (Upstox) or API Access Token (Dhan)")
    client_id: Optional[str] = Field(None, description="Dhan Client ID (Required for Dhan integration)")
    model_type: str = Field("linear", description="Regression model: 'linear', 'xgboost', or 'trend'")
    lookback_days: int = Field(90, ge=30, le=365, description="Historical price lookback window in days")


# --- Endpoints ---

@app.get("/health", tags=["System"])
async def health_check():
    """Health check endpoint to verify backend operational state."""
    return {"status": "ok", "service": "Quant ML Terminal Backend"}


@app.get("/api/upstox/login", tags=["Authentication"])
async def get_upstox_login_url():
    """Generates the Upstox OAuth 2.0 authorization dialog URL."""
    if not settings.UPSTOX_CLIENT_ID or not settings.UPSTOX_REDIRECT_URI:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Upstox OAuth credentials (CLIENT_ID / REDIRECT_URI) are missing in backend/.env"
        )
    
    auth_url = (
        f"https://api.upstox.com/v2/login/authorization/dialog"
        f"?response_type=code&client_id={settings.UPSTOX_CLIENT_ID}"
        f"&redirect_uri={settings.UPSTOX_REDIRECT_URI}"
    )
    return {"authorization_url": auth_url}


@app.get("/api/upstox/callback", tags=["Authentication"])
async def upstox_callback(code: str = Query(..., description="OAuth authorization code returned by Upstox")):
    """Exchanges Upstox OAuth code for an access token."""
    try:
        token_data = await exchange_upstox_code(
            code=code,
            client_id=settings.UPSTOX_CLIENT_ID,
            client_secret=settings.UPSTOX_CLIENT_SECRET,
            redirect_uri=settings.UPSTOX_REDIRECT_URI
        )
        return {
            "status": "success",
            "access_token": token_data.get("access_token"),
            "token_type": token_data.get("token_type", "Bearer")
        }
    except Exception as e:
        logger.error(f"Upstox token exchange error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to exchange Upstox authorization code: {str(e)}"
        )


@app.post("/api/sync-and-analyze", tags=["Portfolio Analytics"])
async def sync_and_analyze(payload: SyncAndAnalyzeRequest):
    """
    Stateless ML Portfolio Analytics Pipeline:
    1. Fetches live holdings from Upstox (OAuth) or Dhan (API token).
    2. Normalizes symbols into Yahoo Finance format (e.g., RELIANCE -> RELIANCE.NS).
    3. Streams market data into selected ML engine (Linear / XGBoost / Trend Proxy).
    4. Computes T+1 NAV targets, portfolio Alpha yield, R² confidence, and target stock prices.
    5. Tokens exist only in memory during execution and are discarded immediately after.
    """
    broker = payload.broker.lower().strip()
    
    # 1. Fetch broker holdings
    try:
        if broker == "upstox":
            holdings = await fetch_upstox_holdings(access_token=payload.access_token)
        elif broker == "dhan":
            if not payload.client_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="client_id is required for Dhan API authentication."
                )
            holdings = await fetch_dhan_holdings(
                client_id=payload.client_id,
                access_token=payload.access_token
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Unsupported broker. Allowed values: 'upstox', 'dhan'."
            )
    except Exception as e:
        logger.error(f"Failed fetching holdings from {broker}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Broker sync error ({broker}): {str(e)}"
        )

    if not holdings:
        return {
            "status": "success",
            "holdings_count": 0,
            "message": "No active equity holdings found in portfolio.",
            "data": None
        }

    # 2. Run Quantitative ML Pipeline
    try:
        engine = PortfolioMLEngine(
            holdings=holdings,
            model_type=payload.model_type,
            lookback_days=payload.lookback_days
        )
        analytics_result = await engine.run_pipeline()
    except Exception as e:
        logger.error(f"ML Pipeline processing failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"ML Prediction Engine failure: {str(e)}"
        )

    return {
        "status": "success",
        "broker": broker,
        "disclaimer": "SEBI Compliance Note: Predictions generated by quantitative models are strictly for analytical and educational purposes, not financial advice.",
        "data": analytics_result
    }