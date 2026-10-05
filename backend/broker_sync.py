import logging
import re
from typing import List, Dict, Any
import httpx

logger = logging.getLogger("quant_terminal")


def normalize_symbol(tradingsymbol: str) -> str:
    """
    Normalizes Indian stock trading symbols into Yahoo Finance ticker format (.NS for NSE).
    Strips exchange prefixes (NSE:) and series suffixes (-EQ, -BE, -SM).
    Examples:
      'RELIANCE'       -> 'RELIANCE.NS'
      'NSE:TATASTEEL'  -> 'TATASTEEL.NS'
      'INFY-EQ'        -> 'INFY.NS'
      'TATAMOTORS.NS'  -> 'TATAMOTORS.NS'
    """
    clean_symbol = tradingsymbol.strip().upper()
    
    # Strip exchange prefixes (e.g., 'NSE:RELIANCE' -> 'RELIANCE')
    if ":" in clean_symbol:
        clean_symbol = clean_symbol.split(":")[-1]

    # Preserve already normalized tickers
    if clean_symbol.endswith(".NS") or clean_symbol.endswith(".BO"):
        return clean_symbol

    # Strip broker series suffixes before appending .NS
    clean_symbol = re.sub(r'-(EQ|BE|SM|ST|N\d)$', '', clean_symbol)

    return f"{clean_symbol}.NS"


async def exchange_upstox_code(code: str, client_id: str, client_secret: str, redirect_uri: str) -> Dict[str, Any]:
    """
    Exchanges Upstox OAuth 2.0 authorization code for an access token.
    """
    url = "https://api.upstox.com/v2/login/authorization/token"
    headers = {
        "accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded"
    }
    data = {
        "code": code,
        "client_id": client_id,
        "client_secret": client_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code"
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(url, headers=headers, data=data, timeout=10.0)
        if response.status_code != 200:
            logger.error(f"Upstox Token Exchange Failed ({response.status_code}): {response.text}")
            raise RuntimeError(f"Upstox OAuth exchange failed: {response.status_code}")
        return response.json()


async def fetch_upstox_holdings(access_token: str) -> List[Dict[str, Any]]:
    """
    Fetches user equity holdings from Upstox API and normalizes symbols to Yahoo Finance format.
    """
    url = "https://api.upstox.com/v2/portfolio/long-term-holdings"
    headers = {
        "accept": "application/json",
        "Authorization": f"Bearer {access_token}"
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=headers, timeout=10.0)
        if response.status_code != 200:
            logger.error(f"Upstox Holdings Fetch Failed ({response.status_code}): {response.text}")
            raise RuntimeError(f"Failed to fetch Upstox holdings: {response.status_code}")

        raw_payload = response.json()
        holdings_list = raw_payload.get("data", [])

        normalized_holdings = []
        for item in holdings_list:
            raw_symbol = item.get("trading_symbol") or item.get("company_name", "")
            quantity = float(item.get("quantity", 0) or item.get("holding_quantity", 0))

            if quantity <= 0 or not raw_symbol:
                continue

            normalized_holdings.append({
                "symbol": normalize_symbol(raw_symbol),
                "original_symbol": raw_symbol,
                "company_name": item.get("company_name", raw_symbol),
                "quantity": float(quantity),
                "average_price": float(item.get("average_price", 0.0)),
                "last_price": float(item.get("last_price", 0.0)),
                "pnl": float(item.get("pnl", 0.0))
            })

        return normalized_holdings


async def fetch_dhan_holdings(client_id: str, access_token: str) -> List[Dict[str, Any]]:
    """
    Fetches user holdings from Dhan API and normalizes symbols to Yahoo Finance format.
    """
    url = "https://api.dhan.co/v2/holdings"
    headers = {
        "access-token": access_token,
        "client-id": client_id,
        "Content-Type": "application/json",
        "Accept": "application/json"
    }

    async with httpx.AsyncClient() as client:
        response = await client.get(url, headers=headers, timeout=10.0)
        if response.status_code != 200:
            logger.error(f"Dhan Holdings Fetch Failed ({response.status_code}): {response.text}")
            raise RuntimeError(f"Failed to fetch Dhan holdings: {response.status_code}")

        payload = response.json()
        holdings_list = payload if isinstance(payload, list) else payload.get("data", [])

        normalized_holdings = []
        for item in holdings_list:
            raw_symbol = item.get("tradingSymbol") or item.get("symbol", "")
            quantity = float(item.get("totalQty") or item.get("quantity") or item.get("holdingQty") or 0)

            if quantity <= 0 or not raw_symbol:
                continue

            unrealized = float(item.get("unrealizedProfit", 0.0) or 0.0)
            realized = float(item.get("realizedProfit", 0.0) or 0.0)

            normalized_holdings.append({
                "symbol": normalize_symbol(raw_symbol),
                "original_symbol": raw_symbol,
                "company_name": item.get("tradingSymbol", raw_symbol),
                "quantity": float(quantity),
                "average_price": float(item.get("avgCostPrice", 0.0) or item.get("averagePrice", 0.0)),
                "last_price": float(item.get("lastPrice", 0.0) or item.get("closePrice", 0.0)),
                "pnl": round(unrealized + realized, 2)
            })

        return normalized_holdings