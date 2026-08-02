from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
from predictor import predict_stock
from datetime import datetime, timedelta

app = FastAPI()

# Allow frontend to communicate with backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=False,  # Set to False so wildcard '*' works cleanly
    allow_methods=["*"],
    allow_headers=["*"],
)

class PortfolioItem(BaseModel):
    symbol: str
    shares: float

class PortfolioRequest(BaseModel):
    stocks: List[PortfolioItem]

# Health check route
@app.get("/")
def read_root():
    return {"status": "online", "message": "Portfolio Predictor API is running!"}

@app.post("/analyze")
def analyze_portfolio(request: PortfolioRequest):
    end_date = datetime.today().strftime('%Y-%m-%d')
    start_date = (datetime.today() - timedelta(days=365)).strftime('%Y-%m-%d')
    
    results = []
    total_current = 0.0
    total_predicted = 0.0
    
    for item in request.stocks:
        if not item.symbol: 
            continue
        
        try:
            pred = predict_stock(item.symbol.upper(), item.shares, start_date, end_date)
            results.append(pred)
            
            if isinstance(pred, dict) and not pred.get("error"):
                total_current += pred.get("current_value", 0.0)
                total_predicted += pred.get("predicted_value", 0.0)
        except Exception as e:
            results.append({
                "symbol": item.symbol.upper(),
                "error": f"Failed to process {item.symbol}: {str(e)}"
            })

    overall_pct = ((total_predicted - total_current) / total_current * 100) if total_current > 0 else 0

    return {
        "individual_results": results,
        "summary": {
            "total_current_value": total_current,
            "total_predicted_value": total_predicted,
            "overall_percentage_change": overall_pct
        }
    }