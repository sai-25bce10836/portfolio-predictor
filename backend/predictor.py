import yfinance as yf
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LinearRegression
from sklearn.metrics import r2_score
import warnings
from datetime import timedelta

warnings.filterwarnings("ignore")

def predict_stock(symbol: str, shares: float, start_date: str, end_date: str):
    try:
        data = yf.download(symbol, start=start_date, end=end_date, progress=False)
        
        if isinstance(data.columns, pd.MultiIndex):
            data.columns = data.columns.droplevel(1)

        if data.empty:
            return {"symbol": symbol, "error": "No data found."}

        data["Return"] = data["Close"].pct_change()
        data["MA5"] = data["Close"].rolling(window=5).mean()
        data["MA10"] = data["Close"].rolling(window=10).mean()
        data["Tomorrow_Close"] = data["Close"].shift(-1)
        data.dropna(inplace=True)

        if data.empty:
            return {"symbol": symbol, "error": "Not enough data."}

        X = data[["Open", "High", "Low", "Close", "Volume", "Return", "MA5", "MA10"]]
        y = data["Tomorrow_Close"]

        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        scaler = StandardScaler()
        X_train_scaled = scaler.fit_transform(X_train)
        X_test_scaled = scaler.transform(X_test)

        model = LinearRegression()
        model.fit(X_train_scaled, y_train)
        accuracy = r2_score(y_test, model.predict(X_test_scaled)) * 100

        latest_data = scaler.transform(X.iloc[[-1]])
        predicted_price = float(model.predict(latest_data)[0])
        current_price = float(data["Close"].iloc[-1])
        
        # Extract last 60 days of history for the chart
        history = []
        for date, row in data.tail(60).iterrows():
            history.append({
                "time": date.strftime('%Y-%m-%d'),
                "value": float(row["Close"])
            })
            
        # Add the predicted next day
        next_day = (data.index[-1] + timedelta(days=1)).strftime('%Y-%m-%d')

        return {
            "symbol": symbol.upper(),
            "shares": shares,
            "current_price": current_price,
            "predicted_price": predicted_price,
            "current_value": current_price * shares,
            "predicted_value": predicted_price * shares,
            "percentage_change": ((predicted_price - current_price) / current_price) * 100,
            "accuracy": accuracy,
            "history": history,
            "prediction_date": next_day,
            "error": None
        }
    except Exception as e:
        return {"symbol": symbol, "error": str(e)}