document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const portfolioList = document.getElementById('portfolio-list');
    const addBtn = document.getElementById('add-btn');
    const analyzeBtn = document.getElementById('analyze-btn');
    
    const btnShowChart = document.getElementById('btn-show-chart');
    const btnShowTable = document.getElementById('btn-show-table');
    const chartSection = document.getElementById('chart-section');
    const resultsSection = document.getElementById('results-section');
    
    const weightSlider = document.getElementById('weight-slider');
    const sliderValue = document.getElementById('slider-value');
    const simulateBtn = document.getElementById('simulate-btn');
    const resetLayoutBtn = document.getElementById('reset-layout-btn');

    let globalPortfolioData = []; // Store raw individual stock results
    let rawSummaryData = null;     // Store base summary metrics
    let chart, lineSeries, predictedSeries;

    // 1. Initialize TradingView Chart with Sensibull Dark Theme
    function initChart() {
        const chartContainer = document.getElementById('tv-chart');
        if (!chartContainer) return;

        chart = LightweightCharts.createChart(chartContainer, {
            width: chartContainer.clientWidth || 600,
            height: chartContainer.clientHeight || 410,
            layout: {
                background: { type: 'solid', color: 'transparent' },
                textColor: '#94a3b8',
                fontFamily: "'JetBrains Mono', monospace",
            },
            grid: {
                vertLines: { color: '#1e2d42' },
                horzLines: { color: '#1e2d42' },
            },
            crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
            timeScale: { 
                borderColor: '#1e2d42',
                timeVisible: true,
                secondsVisible: false
            },
            rightPriceScale: {
                borderColor: '#1e2d42',
            }
        });

        // Historical Data Line (ProFolio Primary Blue)
        lineSeries = chart.addLineSeries({
            color: '#2563eb',
            lineWidth: 2,
            crosshairMarkerRadius: 5,
        });

        // Predicted Data Line (Sensibull Accent Green/Red)
        predictedSeries = chart.addLineSeries({
            color: '#00e676',
            lineWidth: 2,
            lineStyle: LightweightCharts.LineStyle.Dotted,
        });

        const resizeChart = () => {
            if (chartContainer && chartContainer.clientWidth > 0) {
                chart.applyOptions({
                    width: chartContainer.clientWidth,
                    height: chartContainer.clientHeight || 410
                });
            }
        };

        window.addEventListener('resize', resizeChart);

        if (window.ResizeObserver) {
            const ro = new ResizeObserver(() => resizeChart());
            ro.observe(chartContainer);
        }
    }

    initChart();

    // 2. Initial Asset Rows
    addStockRow('AAPL', 10);
    addStockRow('MSFT', 5);

    addBtn.addEventListener('click', () => addStockRow('', ''));

    function addStockRow(symbol = '', shares = '') {
        const row = document.createElement('div');
        row.className = 'portfolio-row';
        row.innerHTML = `
            <input type="text" placeholder="Ticker (e.g. TSLA)" class="sym-input" value="${symbol}">
            <input type="number" placeholder="Shares" class="share-input" value="${shares}">
            <button class="btn remove" title="Remove Asset">✖</button>
        `;
        row.querySelector('.remove').addEventListener('click', () => row.remove());
        portfolioList.appendChild(row);
    }

    // 3. Quick Scenario Presets
    document.querySelectorAll('.preset-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            const presetType = e.target.innerText.trim();
            portfolioList.innerHTML = ''; // Clear current inputs

            if (presetType === 'US Large Cap') {
                addStockRow('AAPL', 10);
                addStockRow('MSFT', 5);
                addStockRow('GOOGL', 8);
            } else if (presetType === 'Tech Heavy') {
                addStockRow('NVDA', 15);
                addStockRow('TSLA', 10);
                addStockRow('AMZN', 5);
            } else if (presetType === 'Global Split') {
                addStockRow('AAPL', 10);
                addStockRow('ASML', 4);
                addStockRow('TSM', 12);
            }
        });
    });

    // 4. Workspace Viewport Tab Switching (Chart vs Table View)
    btnShowChart.addEventListener('click', () => {
        btnShowChart.classList.add('active');
        btnShowTable.classList.remove('active');
        chartSection.classList.remove('hidden');
        resultsSection.classList.add('hidden');
        
        // Force chart layout refresh upon becoming visible
        setTimeout(() => {
            const chartContainer = document.getElementById('tv-chart');
            if (chartContainer && chart) {
                chart.applyOptions({ width: chartContainer.clientWidth });
                chart.timeScale().fitContent();
            }
        }, 50);
    });

    btnShowTable.addEventListener('click', () => {
        btnShowTable.classList.add('active');
        btnShowChart.classList.remove('active');
        resultsSection.classList.remove('hidden');
        chartSection.classList.add('hidden');
    });

    // Reset Workspace Action
    if (resetLayoutBtn) {
        resetLayoutBtn.addEventListener('click', () => {
            portfolioList.innerHTML = '';
            addStockRow('AAPL', 10);
            addStockRow('MSFT', 5);
            weightSlider.value = 0;
            sliderValue.innerText = '0% Shift';
        });
    }

    // 5. Backend Execution Pipeline
    analyzeBtn.addEventListener('click', async () => {
        analyzeBtn.innerHTML = "<span>Executing Models...</span>";
        analyzeBtn.disabled = true;

        const rows = document.querySelectorAll('.portfolio-row');
        const stocks = [];
        rows.forEach(row => {
            const sym = row.querySelector('.sym-input').value.trim().toUpperCase();
            const shares = parseFloat(row.querySelector('.share-input').value);
            if(sym && !isNaN(shares)) stocks.push({ symbol: sym, shares: shares });
        });

        if (stocks.length === 0) {
            alert("Please input at least one valid ticker and position size.");
            analyzeBtn.innerHTML = "<span>Execute Forecast Engine</span>";
            analyzeBtn.disabled = false;
            return;
        }

        try {
            const response = await fetch('https://portfolio-predictor-s6me.onrender.com/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stocks: stocks })
            });
            
            if (!response.ok) throw new Error("Backend response error");
            
            const data = await response.json();
            globalPortfolioData = data.individual_results;
            rawSummaryData = data.summary;
            
            displayResults(data);
            
            // Auto-render chart for first valid stock
            const firstValid = globalPortfolioData.find(item => !item.error);
            if(firstValid) renderChart(firstValid);

        } catch (error) {
            alert("Connection Error. Ensure FastAPI backend is running.");
        } finally {
            analyzeBtn.innerHTML = "<span>Execute Forecast Engine</span>";
            analyzeBtn.disabled = false;
        }
    });

    // 6. Display Analytics & Render UI Components
    function displayResults(data) {
        // Activate Viewport Containers
        chartSection.classList.remove('hidden');
        btnShowChart.classList.add('active');
        btnShowTable.classList.remove('active');
        resultsSection.classList.add('hidden');
        
        const formatMoney = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

        // Update Header Metric Cards
        document.getElementById('tot-current').innerText = formatMoney(data.summary.total_current_value);
        document.getElementById('tot-predicted').innerText = formatMoney(data.summary.total_predicted_value);
        
        const pctEl = document.getElementById('tot-change');
        const pct = data.summary.overall_percentage_change;
        pctEl.innerText = `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`;
        pctEl.className = pct >= 0 ? 'text-green' : 'text-red';

        // Calculate Average Portfolio Confidence (R²)
        const validItems = data.individual_results.filter(i => !i.error && i.accuracy !== undefined);
        const avgConfidence = validItems.length > 0
            ? validItems.reduce((acc, curr) => acc + curr.accuracy, 0) / validItems.length
            : 0;
        
        const avgConfidenceEl = document.getElementById('avg-confidence');
        if (avgConfidenceEl) {
            avgConfidenceEl.innerText = `${avgConfidence.toFixed(1)}%`;
        }

        // Render Table Body
        const tbody = document.getElementById('results-body');
        tbody.innerHTML = '';
        
        data.individual_results.forEach(item => {
            const tr = document.createElement('tr');
            if(item.error) {
                tr.innerHTML = `<td colspan="6" class="text-red">${item.symbol}: ${item.error}</td>`;
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
                    <td><span class="badge">${item.accuracy.toFixed(1)}%</span></td>
                `;
                
                // Click row to focus chart on asset
                tr.addEventListener('click', () => {
                    renderChart(item);
                    // Switch to chart view on row click
                    btnShowChart.click();
                });
            }
            tbody.appendChild(tr);
        });
    }

    // 7. Render TradingView Trajectory Chart
    function renderChart(itemData) {
        document.getElementById('chart-title').innerText = `${itemData.symbol} Target Trajectory`;
        document.getElementById('chart-accuracy').innerText = `Model Confidence R²: ${itemData.accuracy.toFixed(1)}%`;

        // Load Historical Time Series
        lineSeries.setData(itemData.history);

        // Build Prediction Connector Line
        const lastHistorical = itemData.history[itemData.history.length - 1];
        predictedSeries.setData([
            lastHistorical,
            { time: itemData.prediction_date, value: itemData.predicted_price }
        ]);

        // Dynamic Trajectory Coloring
        const trendColor = itemData.predicted_price >= lastHistorical.value ? '#00e676' : '#ff5252';
        predictedSeries.applyOptions({ color: trendColor });

        // Recalculate layout scales
        setTimeout(() => {
            const chartContainer = document.getElementById('tv-chart');
            if (chartContainer && chart) {
                chart.applyOptions({
                    width: chartContainer.clientWidth,
                    height: chartContainer.clientHeight || 410
                });
                chart.timeScale().fitContent();
            }
        }, 50);
    }

    // 8. Sensibull "What-If" Stress-Testing Slider Integration
    if (weightSlider) {
        weightSlider.addEventListener('input', (e) => {
            const shiftVal = parseInt(e.target.value);
            sliderValue.innerText = `${shiftVal > 0 ? '+' : ''}${shiftVal}% Shift`;
        });
    }

    if (simulateBtn) {
        simulateBtn.addEventListener('click', () => {
            if (!rawSummaryData) {
                alert("Please execute an initial forecast analysis before running stress test scenarios.");
                return;
            }

            const shiftPercent = parseFloat(weightSlider.value) / 100;
            const formatMoney = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

            // Simulating a portfolio shift adjustment on projected value
            const basePredicted = rawSummaryData.total_predicted_value;
            const simulatedPredicted = basePredicted * (1 + shiftPercent);
            
            const baseCurrent = rawSummaryData.total_current_value;
            const simulatedPctChange = ((simulatedPredicted - baseCurrent) / baseCurrent) * 100;

            // Update UI elements to reflect stress test scenario
            document.getElementById('tot-predicted').innerText = formatMoney(simulatedPredicted);
            
            const pctEl = document.getElementById('tot-change');
            pctEl.innerText = `${simulatedPctChange > 0 ? '+' : ''}${simulatedPctChange.toFixed(2)}%`;
            pctEl.className = simulatedPctChange >= 0 ? 'text-green' : 'text-red';
        });
    }
});