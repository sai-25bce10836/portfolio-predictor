import logging
from typing import List, Dict, Any, Tuple

import numpy as np
import pandas as pd
import yfinance as yf
from sklearn.linear_model import LinearRegression
from xgboost import XGBRegressor
from lightgbm import LGBMRegressor


logger = logging.getLogger("quant_terminal")


class PortfolioMLEngine:
    """
    Quantitative Machine Learning Pipeline for Indian Stock Portfolios.

    - Streams historical 1D daily price data via yfinance.
    - Trains regression models:
        * Linear Regression
        * XGBoost
        * LightGBM
        * Trend Proxy
    - Calculates T+1 NAV targets, portfolio Alpha yield, and average R² confidence.
    - Generates historical chart data for frontend visualization.
    - Generates OHLC chart data for candlestick and bar visualizations.
    """

    def __init__(
        self,
        holdings: List[Dict[str, Any]],
        model_type: str = "linear",
        lookback_days: int = 90
    ):
        self.holdings = self._normalize_holdings(holdings)
        self.model_type = model_type.lower().strip()
        self.lookback_days = lookback_days

    def _normalize_holdings(
        self,
        raw_holdings: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """
        Normalizes holding dictionaries to accept either 'symbol' or
        'trading_symbol', and ensures Indian equity tickers have
        '.NS' or '.BO' suffixes for yfinance.
        """

        normalized = []

        for item in raw_holdings:
            sym = (
                item.get("symbol")
                or item.get("trading_symbol")
                or item.get("tradingsymbol")
            )

            if not sym:
                continue

            sym = str(sym).upper().strip()

            # Append .NS default suffix for Indian stock tickers if missing
            if (
                not sym.endswith(".NS")
                and not sym.endswith(".BO")
                and not sym.startswith("^")
            ):
                sym = f"{sym}.NS"

            qty = float(
                item.get("quantity")
                or item.get("quantity_held")
                or 0.0
            )

            avg_price = float(
                item.get("average_price")
                or item.get("avg_price")
                or 0.0
            )

            last_price = float(
                item.get("last_price")
                or item.get("close")
                or 0.0
            )

            normalized.append({
                "symbol": sym,
                "company_name": item.get(
                    "company_name",
                    sym.replace(".NS", "").replace(".BO", "")
                ),
                "quantity": qty,
                "average_price": avg_price,
                "last_price": last_price
            })

        return normalized

    async def run_pipeline(self) -> Dict[str, Any]:
        if not self.holdings:
            return {}

        symbols = [
            item["symbol"]
            for item in self.holdings
            if item.get("symbol")
        ]

        if not symbols:
            raise ValueError("No valid tickers found in portfolio holdings.")

        logger.info(
            f"Downloading {self.lookback_days}d price history "
            f"for {len(symbols)} tickers..."
        )

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
        close_prices = self._extract_close_prices(
            df_data,
            symbols
        )

        # Parse full OHLC data for frontend candlestick/bar charts.
        ohlc_prices = self._extract_ohlc_prices(
            df_data,
            symbols
        )

        analyzed_stocks = []

        total_current_nav = 0.0
        total_projected_nav = 0.0
        weighted_r2_sum = 0.0

        # ---------------------------------------------------------
        # Pass 1: Calculate total current NAV
        # ---------------------------------------------------------
        for holding in self.holdings:
            symbol = holding["symbol"]
            qty = holding["quantity"]

            series = close_prices.get(symbol)

            latest_price = (
                float(series.dropna().iloc[-1])
                if (
                    series is not None
                    and not series.dropna().empty
                )
                else float(holding.get("last_price", 0.0))
            )

            holding_current_val = latest_price * qty
            total_current_nav += holding_current_val

        # ---------------------------------------------------------
        # Pass 2: Train models and execute T+1 predictions
        # ---------------------------------------------------------
        for holding in self.holdings:

            symbol = holding["symbol"]
            qty = holding["quantity"]

            series = close_prices.get(symbol)

            # Full OHLC dataframe for this stock.
            ohlc_df = ohlc_prices.get(symbol)

            history = []
            ohlc_history = []
            prediction_date = None

            # -----------------------------------------------------
            # Prepare clean historical series
            # -----------------------------------------------------
            if series is not None:
                clean_series = series.dropna().copy()

                # Ensure chronological order
                clean_series = clean_series.sort_index()

                # Remove duplicate dates if any
                clean_series = clean_series[
                    ~clean_series.index.duplicated(
                        keep="last"
                    )
                ]
            else:
                clean_series = pd.Series(dtype=float)

            # -----------------------------------------------------
            # Generate frontend line/area chart history
            # -----------------------------------------------------
            if not clean_series.empty:

                for timestamp, value in clean_series.items():

                    try:
                        numeric_value = float(value)

                        if not np.isfinite(numeric_value):
                            continue

                        # Convert timestamp to strict YYYY-MM-DD.
                        # Lightweight Charts works reliably with this format.
                        chart_date = pd.Timestamp(
                            timestamp
                        ).strftime("%Y-%m-%d")

                        history.append({
                            "time": chart_date,
                            "value": round(
                                numeric_value,
                                2
                            )
                        })

                    except (TypeError, ValueError):
                        continue

                # T+1 prediction date.
                # BDay gives the next business day rather than simply
                # adding 24 hours.
                if not clean_series.empty:
                    last_date = pd.Timestamp(
                        clean_series.index[-1]
                    )

                    next_business_day = (
                        last_date +
                        pd.offsets.BDay(1)
                    )

                    prediction_date = (
                        next_business_day.strftime(
                            "%Y-%m-%d"
                        )
                    )

            # -----------------------------------------------------
            # Generate frontend OHLC chart history
            # -----------------------------------------------------
            if ohlc_df is not None and not ohlc_df.empty:

                # Make a clean chronological copy.
                clean_ohlc = ohlc_df.copy()

                clean_ohlc = clean_ohlc.sort_index()

                clean_ohlc = clean_ohlc[
                    ~clean_ohlc.index.duplicated(
                        keep="last"
                    )
                ]

                for timestamp, row in clean_ohlc.iterrows():

                    try:
                        open_value = float(row["Open"])
                        high_value = float(row["High"])
                        low_value = float(row["Low"])
                        close_value = float(row["Close"])

                        values = [
                            open_value,
                            high_value,
                            low_value,
                            close_value
                        ]

                        # Skip malformed/non-finite OHLC rows.
                        if not all(
                            np.isfinite(value)
                            for value in values
                        ):
                            continue

                        # Basic OHLC validity check.
                        # This prevents malformed rows from reaching
                        # the TradingView candlestick renderer.
                        if (
                            high_value < max(
                                open_value,
                                close_value
                            )
                            or
                            low_value > min(
                                open_value,
                                close_value
                            )
                        ):
                            continue

                        chart_date = pd.Timestamp(
                            timestamp
                        ).strftime("%Y-%m-%d")

                        ohlc_history.append({
                            "time": chart_date,
                            "open": round(
                                open_value,
                                2
                            ),
                            "high": round(
                                high_value,
                                2
                            ),
                            "low": round(
                                low_value,
                                2
                            ),
                            "close": round(
                                close_value,
                                2
                            )
                        })

                    except (
                        TypeError,
                        ValueError,
                        KeyError
                    ):
                        continue

            # -----------------------------------------------------
            # Model prediction
            # -----------------------------------------------------
            if clean_series.shape[0] < 15:

                latest_price = float(
                    holding.get("last_price", 0.0)
                )

                # If market data exists, use its latest value.
                if not clean_series.empty:
                    latest_price = float(
                        clean_series.iloc[-1]
                    )

                pred_price = latest_price
                r2_score = 0.0

            else:

                latest_price = float(
                    clean_series.iloc[-1]
                )

                pred_price, r2_score = (
                    self._predict_next_close(
                        clean_series.values
                    )
                )

            # -----------------------------------------------------
            # Portfolio calculations
            # -----------------------------------------------------
            holding_current_val = (
                latest_price * qty
            )

            holding_projected_val = (
                pred_price * qty
            )

            total_projected_nav += (
                holding_projected_val
            )

            weight = (
                holding_current_val /
                total_current_nav
                if total_current_nav > 0
                else 0.0
            )

            weighted_r2_sum += (
                r2_score * weight
            )

            expected_move_pct = (
                (
                    (pred_price - latest_price)
                    / latest_price
                    * 100.0
                )
                if latest_price > 0
                else 0.0
            )

            # -----------------------------------------------------
            # Final stock analytics object
            # -----------------------------------------------------
            analyzed_stocks.append({
                "symbol": symbol,

                "company_name": holding.get(
                    "company_name",
                    symbol
                ),

                "quantity": qty,

                "average_price": round(
                    float(
                        holding.get(
                            "average_price",
                            0.0
                        )
                    ),
                    2
                ),

                "current_price": round(
                    latest_price,
                    2
                ),

                "target_price_t1": round(
                    pred_price,
                    2
                ),

                "expected_change_pct": round(
                    expected_move_pct,
                    2
                ),

                "current_value": round(
                    holding_current_val,
                    2
                ),

                "projected_value": round(
                    holding_projected_val,
                    2
                ),

                "weight_pct": round(
                    weight * 100.0,
                    2
                ),

                "model_r2_score": round(
                    max(0.0, r2_score),
                    4
                ),

                # Existing line/area chart data.
                "history": history,

                # New OHLC data for candlestick/bar charts.
                "ohlc_history": ohlc_history,

                # T+1 chart prediction date.
                "prediction_date": prediction_date
            })

        # ---------------------------------------------------------
        # Portfolio-level calculations
        # ---------------------------------------------------------
        portfolio_alpha_pct = (
            (
                (
                    total_projected_nav -
                    total_current_nav
                )
                / total_current_nav
                * 100.0
            )
            if total_current_nav > 0
            else 0.0
        )

        return {
            "summary": {
                "total_current_nav": round(
                    total_current_nav,
                    2
                ),

                "total_projected_nav": round(
                    total_projected_nav,
                    2
                ),

                "portfolio_alpha_pct": round(
                    portfolio_alpha_pct,
                    2
                ),

                "average_r2_confidence": round(
                    max(0.0, weighted_r2_sum),
                    4
                ),

                "model_used": self.model_type,

                "lookback_days": self.lookback_days,

                "total_positions": len(
                    analyzed_stocks
                )
            },

            "holdings": analyzed_stocks
        }

    def _extract_close_prices(
        self,
        df_data: pd.DataFrame,
        symbols: List[str]
    ) -> Dict[str, pd.Series]:
        """
        Extracts individual close price pd.Series per stock
        regardless of yfinance multi-index format.
        """

        result = {}

        if df_data is None or df_data.empty:
            return result

        if isinstance(
            df_data.columns,
            pd.MultiIndex
        ):

            # Price Level multi-index:
            # ('Close', 'RELIANCE.NS')
            if "Close" in df_data.columns.get_level_values(0):

                close_df = df_data["Close"]

                for sym in symbols:

                    if sym in close_df.columns:
                        result[sym] = close_df[sym]

            # Ticker Level multi-index:
            # ('RELIANCE.NS', 'Close')
            elif "Close" in df_data.columns.get_level_values(1):

                for sym in symbols:

                    try:
                        result[sym] = (
                            df_data
                            .xs(
                                "Close",
                                level=1,
                                axis=1
                            )[sym]
                        )

                    except KeyError:
                        pass

        else:

            if "Close" in df_data.columns:

                result[symbols[0]] = (
                    df_data["Close"]
                )

            elif (
                len(symbols) == 1
                and isinstance(
                    df_data,
                    pd.Series
                )
            ):

                result[symbols[0]] = df_data

        return result

    def _extract_ohlc_prices(
        self,
        df_data: pd.DataFrame,
        symbols: List[str]
    ) -> Dict[str, pd.DataFrame]:
        """
        Extracts Open, High, Low and Close data for each stock.

        Supports both yfinance MultiIndex formats:

            ('Open', 'RELIANCE.NS')
            ('RELIANCE.NS', 'Open')

        and the standard single-symbol dataframe format.

        Returns:
            {
                "RELIANCE.NS": DataFrame[
                    ["Open", "High", "Low", "Close"]
                ]
            }
        """

        result = {}

        if df_data is None or df_data.empty:
            return result

        required_columns = [
            "Open",
            "High",
            "Low",
            "Close"
        ]

        # ---------------------------------------------------------
        # Multi-symbol yfinance response
        # ---------------------------------------------------------
        if isinstance(
            df_data.columns,
            pd.MultiIndex
        ):

            level_0_values = (
                df_data.columns
                .get_level_values(0)
            )

            level_1_values = (
                df_data.columns
                .get_level_values(1)
            )

            # -----------------------------------------------------
            # Format:
            # ('Open', 'RELIANCE.NS')
            # ('High', 'RELIANCE.NS')
            # -----------------------------------------------------
            if all(
                column in level_0_values
                for column in required_columns
            ):

                for sym in symbols:

                    try:

                        stock_df = (
                            df_data[
                                required_columns
                            ]
                            .xs(
                                sym,
                                level=1,
                                axis=1
                            )
                        )

                        # Ensure consistent column order.
                        stock_df = stock_df[
                            required_columns
                        ].copy()

                        result[sym] = stock_df

                    except (
                        KeyError,
                        ValueError
                    ):
                        continue

            # -----------------------------------------------------
            # Format:
            # ('RELIANCE.NS', 'Open')
            # ('RELIANCE.NS', 'High')
            # -----------------------------------------------------
            elif all(
                column in level_1_values
                for column in required_columns
            ):

                for sym in symbols:

                    try:

                        stock_df = (
                            df_data
                            .xs(
                                sym,
                                level=0,
                                axis=1
                            )
                        )

                        stock_df = stock_df[
                            required_columns
                        ].copy()

                        result[sym] = stock_df

                    except (
                        KeyError,
                        ValueError
                    ):
                        continue

        # ---------------------------------------------------------
        # Single-symbol yfinance response
        # ---------------------------------------------------------
        else:

            if all(
                column in df_data.columns
                for column in required_columns
            ):

                if symbols:

                    stock_df = (
                        df_data[
                            required_columns
                        ].copy()
                    )

                    result[symbols[0]] = (
                        stock_df
                    )

        return result

    def _predict_next_close(
        self,
        prices: np.ndarray
    ) -> Tuple[float, float]:
        """
        Trains model on price features and outputs
        (T+1 Predicted Price, R² Score).

        Prevents data leakage by shifting rolling averages.
        """

        n = len(prices)

        if n < 15:
            return float(prices[-1]), 0.0

        # ---------------------------------------------------------
        # Build feature matrix strictly using past data
        # ---------------------------------------------------------
        df = pd.DataFrame({
            "close": prices
        })

        df["lag_1"] = (
            df["close"].shift(1)
        )

        df["lag_2"] = (
            df["close"].shift(2)
        )

        df["sma_5"] = (
            df["close"]
            .rolling(window=5)
            .mean()
            .shift(1)
        )

        df["sma_10"] = (
            df["close"]
            .rolling(window=10)
            .mean()
            .shift(1)
        )

        train_df = df.dropna().copy()

        if len(train_df) < 10:
            return float(prices[-1]), 0.0

        X = train_df[
            [
                "lag_1",
                "lag_2",
                "sma_5",
                "sma_10"
            ]
        ]

        y = train_df["close"]

        # ---------------------------------------------------------
        # Today's features to predict tomorrow (T+1)
        # ---------------------------------------------------------
        latest_features = np.array([[
            prices[-1],                  # Tomorrow's lag_1
            prices[-2],                  # Tomorrow's lag_2
            float(np.mean(prices[-5:])), # Tomorrow's SMA-5
            float(np.mean(prices[-10:])) # Tomorrow's SMA-10
        ]])

        # ---------------------------------------------------------
        # Train/Test split for out-of-sample R² evaluation
        # ---------------------------------------------------------
        split_idx = int(len(X) * 0.8)

        X_train = X.iloc[:split_idx]
        X_test = X.iloc[split_idx:]

        y_train = y.iloc[:split_idx]
        y_test = y.iloc[split_idx:]

        # ---------------------------------------------------------
        # XGBoost
        # ---------------------------------------------------------
        if self.model_type == "xgboost":

            model = XGBRegressor(
                n_estimators=35,
                max_depth=3,
                learning_rate=0.08,
                random_state=42
            )

            model.fit(
                X_train,
                y_train
            )

            pred_t1 = float(
                model.predict(
                    latest_features
                )[0]
            )

            r2 = (
                float(
                    model.score(
                        X_test,
                        y_test
                    )
                )
                if len(X_test) > 2
                else float(
                    model.score(
                        X_train,
                        y_train
                    )
                )
            )

        # ---------------------------------------------------------
        # LightGBM
        # ---------------------------------------------------------
        elif self.model_type == "lightgbm":

            model = LGBMRegressor(
                n_estimators=100,
                learning_rate=0.05,
                max_depth=3,
                num_leaves=15,
                min_child_samples=10,
                subsample=0.8,
                colsample_bytree=0.8,
                random_state=42,
                verbosity=-1
            )

            model.fit(
                X_train,
                y_train
            )

            pred_t1 = float(
                model.predict(
                    latest_features
                )[0]
            )

            r2 = (
                float(
                    model.score(
                        X_test,
                        y_test
                    )
                )
                if len(X_test) > 2
                else float(
                    model.score(
                        X_train,
                        y_train
                    )
                )
            )

        # ---------------------------------------------------------
        # Trend model
        # ---------------------------------------------------------
        elif self.model_type == "trend":

            model = LinearRegression()

            model.fit(
                X_train,
                y_train
            )

            r2 = (
                float(
                    model.score(
                        X_test,
                        y_test
                    )
                )
                if len(X_test) > 2
                else float(
                    model.score(
                        X_train,
                        y_train
                    )
                )
            )

            reg_pred = float(
                model.predict(
                    latest_features
                )[0]
            )

            ema_pred = float(
                pd.Series(prices)
                .ewm(span=5)
                .mean()
                .iloc[-1]
            )

            pred_t1 = (
                (0.6 * reg_pred)
                + (0.4 * ema_pred)
            )

        # ---------------------------------------------------------
        # Default Linear Regression model
        # ---------------------------------------------------------
        else:

            model = LinearRegression()

            model.fit(
                X_train,
                y_train
            )

            r2 = (
                float(
                    model.score(
                        X_test,
                        y_test
                    )
                )
                if len(X_test) > 2
                else float(
                    model.score(
                        X_train,
                        y_train
                    )
                )
            )

            pred_t1 = float(
                model.predict(
                    latest_features
                )[0]
            )

        return pred_t1, max(0.0, r2)