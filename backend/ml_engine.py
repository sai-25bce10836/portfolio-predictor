import logging
from typing import List, Dict, Any, Tuple
import numpy as np
import pandas as pd
import yfinance as yf
from sklearn.linear_model import LinearRegression
from xgboost import XGBRegressor

logger = logging.getLogger("quant_terminal")


class PortfolioMLEngine:
    """
    Quantitative Machine Learning Pipeline for Indian Stock Portfolios.
    - Streams historical 1D daily price data via yfinance.
    - Trains regression models (Linear Baseline, XGBoost, or Trend Proxy).
    - Calculates T+1 NAV targets, portfolio Alpha yield, and average R² confidence.
    """

    def __init__(self, holdings: List[Dict[str, Any]], model_type: str = "linear", lookback_days: int = 90):
        self.holdings = self._normalize_holdings(holdings)
        self.model_type = model_type.lower().strip()
        self.lookback_days = lookback_days

    def _normalize_holdings(self, raw_holdings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Normalizes holding dictionaries to accept either 'symbol' or 'trading_symbol',
        and ensures Indian equity tickers have '.NS' or '.BO' suffixes for yfinance.
        """
        normalized = []
        for item in raw_holdings:
            sym = item.get("symbol") or item.get("trading_symbol") or item.get("tradingsymbol")
            if not sym:
                continue

            sym = str(sym).upper().strip()
            # Append .NS default suffix for Indian stock tickers if missing
            if not sym.endswith(".NS") and not sym.endswith(".BO") and not sym.startswith("^"):
                sym = f"{sym}.NS"

            qty = float(item.get("quantity") or item.get("quantity_held") or 0.0)
            avg_price = float(item.get("average_price") or item.get("avg_price") or 0.0)
            last_price = float(item.get("last_price") or item.get("close") or 0.0)

            normalized.append({
                "symbol": sym,
                "company_name": item.get("company_name", sym.replace(".NS", "").replace(".BO", "")),
                "quantity": qty,
                "average_price": avg_price,
                "last_price": last_price
            })
        return normalized

    async def run_pipeline(self) -> Dict[str, Any]:
        if not self.holdings:
            return {}

        symbols = [item["symbol"] for item in self.holdings if item.get("symbol")]
        if not symbols:
            raise ValueError("No valid tickers found in portfolio holdings.")

        logger.info(f"Downloading {self.lookback_days}d price history for {len(symbols)} tickers...")

        # Download historical daily price data
        try:
            df_data = yf.download(
                tickers=symbols,
                period=f"{self.lookback_days}d",
                interval="1d",
                auto_adjust=True,
                progress=False
            )
        except Exception as e:
            logger.error(f"yfinance download failed: {str(e)}")
            raise RuntimeError(f"Market data stream failed: {str(e)}")

        # Parse close prices depending on single vs multi-symbol response format
        close_prices = self._extract_close_prices(df_data, symbols)

        analyzed_stocks = []
        total_current_nav = 0.0
        total_projected_nav = 0.0
        weighted_r2_sum = 0.0

        # Pass 1: Calculate total current NAV
        for holding in self.holdings:
            symbol = holding["symbol"]
            qty = holding["quantity"]
            series = close_prices.get(symbol)

            latest_price = float(series.dropna().iloc[-1]) if (series is not None and not series.dropna().empty) else float(holding.get("last_price", 0.0))
            holding_current_val = latest_price * qty
            total_current_nav += holding_current_val

        # Pass 2: Train models and execute T+1 predictions
        for holding in self.holdings:
            symbol = holding["symbol"]
            qty = holding["quantity"]
            series = close_prices.get(symbol)

            if series is None or series.dropna().shape[0] < 15:
                latest_price = float(holding.get("last_price", 0.0))
                pred_price = latest_price
                r2_score = 0.0
            else:
                clean_series = series.dropna()
                latest_price = float(clean_series.iloc[-1])
                pred_price, r2_score = self._predict_next_close(clean_series.values)

            holding_current_val = latest_price * qty
            holding_projected_val = pred_price * qty
            total_projected_nav += holding_projected_val

            weight = (holding_current_val / total_current_nav) if total_current_nav > 0 else 0.0
            weighted_r2_sum += r2_score * weight

            expected_move_pct = ((pred_price - latest_price) / latest_price * 100.0) if latest_price > 0 else 0.0

            analyzed_stocks.append({
                "symbol": symbol,
                "company_name": holding.get("company_name", symbol),
                "quantity": qty,
                "average_price": round(float(holding.get("average_price", 0.0)), 2),
                "current_price": round(latest_price, 2),
                "target_price_t1": round(pred_price, 2),
                "expected_change_pct": round(expected_move_pct, 2),
                "current_value": round(holding_current_val, 2),
                "projected_value": round(holding_projected_val, 2),
                "weight_pct": round(weight * 100.0, 2),
                "model_r2_score": round(max(0.0, r2_score), 4)
            })

        portfolio_alpha_pct = ((total_projected_nav - total_current_nav) / total_current_nav * 100.0) if total_current_nav > 0 else 0.0

        return {
            "summary": {
                "total_current_nav": round(total_current_nav, 2),
                "total_projected_nav": round(total_projected_nav, 2),
                "portfolio_alpha_pct": round(portfolio_alpha_pct, 2),
                "average_r2_confidence": round(max(0.0, weighted_r2_sum), 4),
                "model_used": self.model_type,
                "lookback_days": self.lookback_days,
                "total_positions": len(analyzed_stocks)
            },
            "holdings": analyzed_stocks
        }

    def _extract_close_prices(self, df_data: pd.DataFrame, symbols: List[str]) -> Dict[str, pd.Series]:
        """Extracts individual close price pd.Series per stock regardless of yfinance multi-index format."""
        result = {}
        if df_data is None or df_data.empty:
            return result

        if isinstance(df_data.columns, pd.MultiIndex):
            # Check for Price Level multi-index (Price, Ticker)
            if "Close" in df_data.columns.get_level_values(0):
                close_df = df_data["Close"]
                for sym in symbols:
                    if sym in close_df.columns:
                        result[sym] = close_df[sym]
            elif "Close" in df_data.columns.get_level_values(1):
                for sym in symbols:
                    try:
                        result[sym] = df_data.xs("Close", level=1, axis=1)[sym]
                    except KeyError:
                        pass
        else:
            if "Close" in df_data.columns:
                result[symbols[0]] = df_data["Close"]
            elif len(symbols) == 1 and isinstance(df_data, pd.Series):
                result[symbols[0]] = df_data

        return result

    def _predict_next_close(self, prices: np.ndarray) -> Tuple[float, float]:
        """
        Trains model on price features and outputs (T+1 Predicted Price, R² Score).
        Prevents data leakage by shifting rolling averages.
        """
        n = len(prices)
        if n < 15:
            return float(prices[-1]), 0.0

        # Build feature matrix strictly using past data
        df = pd.DataFrame({"close": prices})
        df["lag_1"] = df["close"].shift(1)
        df["lag_2"] = df["close"].shift(2)
        df["sma_5"] = df["close"].rolling(window=5).mean().shift(1)
        df["sma_10"] = df["close"].rolling(window=10).mean().shift(1)

        train_df = df.dropna().copy()

        if len(train_df) < 10:
            return float(prices[-1]), 0.0

        X = train_df[["lag_1", "lag_2", "sma_5", "sma_10"]]
        y = train_df["close"]

        # Today's features to predict tomorrow (T+1)
        latest_features = np.array([[
            prices[-1],                       # Tomorrow's lag_1 = Today's Close
            prices[-2],                       # Tomorrow's lag_2 = Yesterday's Close
            float(np.mean(prices[-5:])),      # Tomorrow's sma_5 = SMA of last 5 closes
            float(np.mean(prices[-10:]))      # Tomorrow's sma_10 = SMA of last 10 closes
        ]])

        # Train/Test split for out-of-sample R2 evaluation
        split_idx = int(len(X) * 0.8)
        X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
        y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]

        if self.model_type == "xgboost":
            model = XGBRegressor(n_estimators=35, max_depth=3, learning_rate=0.08, random_state=42)
            model.fit(X_train, y_train)
            pred_t1 = float(model.predict(latest_features)[0])
            r2 = float(model.score(X_test, y_test)) if len(X_test) > 2 else float(model.score(X_train, y_train))
        elif self.model_type == "trend":
            model = LinearRegression()
            model.fit(X_train, y_train)
            r2 = float(model.score(X_test, y_test)) if len(X_test) > 2 else float(model.score(X_train, y_train))
            reg_pred = float(model.predict(latest_features)[0])
            ema_pred = float(pd.Series(prices).ewm(span=5).mean().iloc[-1])
            pred_t1 = (0.6 * reg_pred) + (0.4 * ema_pred)
        else:
            model = LinearRegression()
            model.fit(X_train, y_train)
            r2 = float(model.score(X_test, y_test)) if len(X_test) > 2 else float(model.score(X_train, y_train))
            pred_t1 = float(model.predict(latest_features)[0])

        return pred_t1, max(0.0, r2)