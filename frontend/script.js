document.addEventListener('DOMContentLoaded', () => {
    const portfolioList = document.getElementById('portfolio-list');
    const addBtn = document.getElementById('add-btn');
    const analyzeBtn = document.getElementById('analyze-btn');
    
    let globalPortfolioData = []; // Store data for chart switching
    let chart, lineSeries, predictedSeries;

    // Initialize TradingView Chart (Empty)
    function initChart() {
        const chartContainer = document.getElementById('tv-chart');
        chart = LightweightCharts.createChart(chartContainer, {
            width: chartContainer.clientWidth,
            height: 350,
            layout: {
                background: { type: 'solid', color: 'transparent' },
                textColor: '#94a3b8',
            },
            grid: {
                vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
                horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
            },
            crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
            timeScale: { borderColor: 'rgba(255, 255, 255, 0.1)' },
        });

        // Historical Data Line
        lineSeries = chart.addLineSeries({
            color: '#3b82f6',
            lineWidth: 2,
            crosshairMarkerRadius: 5,
        });

        // Predicted Data Line (Dotted)
        predictedSeries = chart.addLineSeries({
            color: '#10b981',
            lineWidth: 2,
            lineStyle: LightweightCharts.LineStyle.Dotted,
        });

        // Resize chart dynamically
        window.addEventListener('resize', () => {
            chart.applyOptions({ width: chartContainer.clientWidth });
        });
    }

    initChart();

    // Add initial rows
    addStockRow('AAPL', 10);
    addStockRow('MSFT', 5);

    addBtn.addEventListener('click', () => addStockRow('', ''));

    function addStockRow(symbol = '', shares = '') {
        const row = document.createElement('div');
        row.className = 'portfolio-row';
        row.innerHTML = `
            <input type="text" placeholder="Ticker (e.g. TSLA)" class="sym-input" value="${symbol}">
            <input type="number" placeholder="Shares" class="share-input" value="${shares}">
            <button class="btn remove">✖</button>
        `;
        row.querySelector('.remove').addEventListener('click', () => row.remove());
        portfolioList.appendChild(row);
    }

    analyzeBtn.addEventListener('click', async () => {
        analyzeBtn.innerText = "Processing...";
        analyzeBtn.disabled = true;

        const rows = document.querySelectorAll('.portfolio-row');
        const stocks = [];
        rows.forEach(row => {
            const sym = row.querySelector('.sym-input').value.trim();
            const shares = parseFloat(row.querySelector('.share-input').value);
            if(sym && !isNaN(shares)) stocks.push({ symbol: sym, shares: shares });
        });

        try {
            const response = await fetch('http://127.0.0.1:8000/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stocks: stocks })
            });
            const data = await response.json();
            globalPortfolioData = data.individual_results;
            displayResults(data);
            
            // Render chart for the first successful stock by default
            const firstValid = globalPortfolioData.find(item => !item.error);
            if(firstValid) renderChart(firstValid);

        } catch (error) {
            alert("Connection Error. Ensure FastAPI backend is running.");
        } finally {
            analyzeBtn.innerText = "Execute Analysis";
            analyzeBtn.disabled = false;
        }
    });

    function displayResults(data) {
        document.getElementById('chart-section').classList.remove('hidden');
        document.getElementById('results-section').classList.remove('hidden');
        
        // Format Currency
        const formatMoney = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

        document.getElementById('tot-current').innerText = formatMoney(data.summary.total_current_value);
        document.getElementById('tot-predicted').innerText = formatMoney(data.summary.total_predicted_value);
        
        const pctEl = document.getElementById('tot-change');
        const pct = data.summary.overall_percentage_change;
        pctEl.innerText = `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`;
        pctEl.className = pct >= 0 ? 'text-green' : 'text-red';

        const tbody = document.getElementById('results-body');
        tbody.innerHTML = '';
        
        data.individual_results.forEach(item => {
            const tr = document.createElement('tr');
            if(item.error) {
                tr.innerHTML = `<td colspan="5" class="text-red">${item.symbol}: ${item.error}</td>`;
            } else {
                const isPositive = item.percentage_change >= 0;
                tr.innerHTML = `
                    <td><strong>${item.symbol}</strong></td>
                    <td>${item.shares}</td>
                    <td>${formatMoney(item.current_price)}</td>
                    <td>${formatMoney(item.predicted_price)}</td>
                    <td class="${isPositive ? 'text-green' : 'text-red'}">
                        ${isPositive ? '+' : ''}${item.percentage_change.toFixed(2)}%
                    </td>
                `;
                // Click row to update chart
                tr.addEventListener('click', () => renderChart(item));
            }
            tbody.appendChild(tr);
        });
    }

    function renderChart(itemData) {
        document.getElementById('chart-title').innerText = `${itemData.symbol} - Price Forecast`;
        document.getElementById('chart-accuracy').innerText = `Model R² Confidence: ${itemData.accuracy.toFixed(1)}%`;

        // Set historical data
        lineSeries.setData(itemData.history);

        // Set predicted line (connects last historical point to predicted point)
        const lastHistorical = itemData.history[itemData.history.length - 1];
        predictedSeries.setData([
            lastHistorical,
            { time: itemData.prediction_date, value: itemData.predicted_price }
        ]);

        chart.timeScale().fitContent();
        
        // Update line color based on trend
        const trendColor = itemData.predicted_price >= lastHistorical.value ? '#10b981' : '#ef4444';
        predictedSeries.applyOptions({ color: trendColor });
    }
});