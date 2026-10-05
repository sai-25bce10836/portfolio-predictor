import logging
import warnings
from datetime import datetime, timedelta
from typing import Dict, Any, List

import numpy as np
import pandas as pd
import yfinance as yf
from sklearn.linear_model import LinearRegression
from sklearn.metrics import r2_score
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings("ignore")
logger = logging.getLogger("quant_terminal")


def predict_stock(symbol: str, shares: float = 1.0, lookback_days: int = 180) -> Dict[str, Any]:
    """
    Quantitative T+1 stock price predictor.
    Fixes time-series data leakage, retains today's features for true T+1 prediction,
    and returns historical daily close prices formatted for Lightweight Charts.
    """
    clean_symbol = symbol.strip().upper()
    
    try:
        # Stream historical data
        end_dt = datetime.now()
        start_dt = end_dt - timedelta(days=lookback_days)
        
        raw_data = yf.download(
            clean_symbol,
            start=start_dt.strftime("%Y-%m-%d"),
            end=end_dt.strftime("%Y-%m-%d"),
            progress=False,
            auto_adjust=True
        )

        if raw_data.empty:
            return {"symbol": clean_symbol, "error": f"No market data found for {clean_symbol}."}

        # Safe MultiIndex column flattening for yfinance
        df = raw_data.copy()
        if isinstance(df.columns, pd.MultiIndex):
            if "Close" in df.columns.levels[0]:
                df = df["Close"]
            elif "Close" in df.columns.levels[1]:
                df = df.xs("Close", axis=1, level=1)
            else:
                df.columns = df.columns.get_level_values(0)

        # Ensure single Series/DataFrame normalization
        if isinstance(df, pd.Series):
            data_df = pd.DataFrame({"Close": df})
        else:
            data_df = df

        if "Close" not in data_df.columns or len(data_df) < 15:
            return {"symbol": clean_symbol, "error": "Insufficient price history for ML training."}

        # Feature Engineering
        data_df["Return"] = data_df["Close"].pct_change()
        data_df["MA5"] = data_df["Close"].rolling(window=5).mean()
        data_df["MA10"] = data_df["Close"].rolling(window=10).mean()

        feature_cols = ["Close", "Return", "MA5", "MA10"]
        data_df.dropna(subset=feature_cols, inplace=True)

        if data_df.empty:
            return {"symbol": clean_symbol, "error": "Not enough valid features after processing."}

        # Isolate TODAY'S feature row for prediction before shifting target
        latest_feature_row = data_df[feature_cols].iloc[[-1]]
        current_price = float(data_df["Close"].iloc[-1])

        # Target shifting for model training (Tomorrow's Close)
        data_df["Tomorrow_Close"] = data_df["Close"].shift(-1)
        train_df = data_df.dropna(subset=["Tomorrow_Close"]).copy()

        if len(train_df) < 10:
            return {"symbol": clean_symbol, "error": "Insufficient historical samples for regression."}

        X = train_df[feature_cols]
        y = train_df["Tomorrow_Close"]

        # Chronological sequential split (80% train, 20% test)
        split_idx = int(len(X) * 0.8)
        X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
        y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]

        scaler = StandardScaler()
        X_train_scaled = scaler.fit_transform(X_train)
        X_test_scaled = scaler.transform(X_test)

        model = LinearRegression()
        model.fit(X_train_scaled, y_train)

        # Calculate Out-of-Sample R² confidence
        if len(X_test) > 2:
            y_pred_test = model.predict(X_test_scaled)
            r2_val = r2_score(y_test, y_pred_test)
            accuracy = max(0.0, float(r2_val * 100.0))
        else:
            accuracy = 0.0

        # Predict T+1 Close price
        latest_scaled = scaler.transform(latest_feature_row)
        predicted_price = float(model.predict(latest_scaled)[0])

        # Format historical timeline for frontend Lightweight Charts
        history = []
        for date, row in data_df.tail(60).iterrows():
            formatted_date = date.strftime("%Y-%m-%d") if isinstance(date, (pd.Timestamp, datetime)) else str(date)
            history.append({
                "time": formatted_date,
                "value": round(float(row["Close"]), 2)
            })

        # Calculate next trading business day
        last_date = data_df.index[-1]
        if isinstance(last_date, (pd.Timestamp, datetime)):
            next_day_dt = last_date + pd.tseries.offsets.BDay(1)
            prediction_date_str = next_day_dt.strftime("%Y-%m-%d")
        else:
            prediction_date_str = (datetime.now() + pd.tseries.offsets.BDay(1)).strftime("%Y-%m-%d")

        pct_change = ((predicted_price - current_price) / current_price) * 100.0 if current_price > 0 else 0.0

        return {
            "symbol": clean_symbol,
            "shares": shares,
            "current_price": round(current_price, 2),
            "predicted_price": round(predicted_price, 2),
            "current_value": round(current_price * shares, 2),
            "predicted_value": round(predicted_price * shares, 2),
            "percentage_change": round(pct_change, 2),
            "accuracy": round(accuracy, 2),
            "history": history,
            "prediction_date": prediction_date_str,
            "error": None
        }

    except Exception as e:
        logger.error(f"Error predicting stock {clean_symbol}: {str(e)}")
        return {"symbol": clean_symbol, "shares": shares, "error": str(e)}