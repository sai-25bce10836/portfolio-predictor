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
    allow_origins=["*"], # In production, replace with your frontend URL
    allow_credentials = True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class PortfolioItem(BaseModel):
    symbol: str
    shares: float

class PortfolioRequest(BaseModel):
    stocks: List[PortfolioItem]

@app.post("/analyze")
def analyze_portfolio(request: PortfolioRequest):
    end_date = datetime.today().strftime('%Y-%m-%d')
    start_date = (datetime.today() - timedelta(days=365)).strftime('%Y-%m-%d')
    
    results = []
    total_current = 0.0
    total_predicted = 0.0
    
    for item in request.stocks:
        if not item.symbol: continue
        
        pred = predict_stock(item.symbol, item.shares, start_date, end_date)
        results.append(pred)
        
        if not pred.get("error"):
            total_current += pred["current_value"]
            total_predicted += pred["predicted_value"]

    overall_pct = ((total_predicted - total_current) / total_current * 100) if total_current > 0 else 0

    return {
        "individual_results": results,
        "summary": {
            "total_current_value": total_current,
            "total_predicted_value": total_predicted,
            "overall_percentage_change": overall_pct
        }
    }

# Run this via terminal: uvicorn main:app --reload