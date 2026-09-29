document.addEventListener('DOMContentLoaded', () => {
    // Dynamic API Base URL detection
    const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://127.0.0.1:8000'
        : 'https://portfolio-predictor-s6me.onrender.com';

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

    let globalPortfolioData = [];
    let rawSummaryData = null;
    let lastApiResponse = null; // Stored payload for dynamic model switching
    let chart, lineSeries, predictedSeries;

    // State tracking for active model selection & focused asset
    let activeModel = 'current'; // Defaults to 'current' baseline
    let selectedItemData = null;

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
            timeScale: { borderColor: '#1e2d42', timeVisible: true, secondsVisible: false },
            rightPriceScale: { borderColor: '#1e2d42' }
        });

        lineSeries = chart.addLineSeries({ color: '#2563eb', lineWidth: 2, crosshairMarkerRadius: 5 });
        predictedSeries = chart.addLineSeries({ color: '#00e676', lineWidth: 2, lineStyle: LightweightCharts.LineStyle.Dotted });

        const resizeChart = () => {
            if (chartContainer && chartContainer.clientWidth > 0) {
                chart.applyOptions({ width: chartContainer.clientWidth, height: chartContainer.clientHeight || 410 });
            }
        };

        window.addEventListener('resize', resizeChart);
        if (window.ResizeObserver) {
            const ro = new ResizeObserver(() => resizeChart());
            ro.observe(chartContainer);
        }
    }

    initChart();
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

    document.querySelectorAll('.preset-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            const presetType = e.target.innerText.trim();
            portfolioList.innerHTML = '';
            if (presetType === 'US Large Cap') {
                addStockRow('AAPL', 10); addStockRow('MSFT', 5); addStockRow('GOOGL', 8);
            } else if (presetType === 'Tech Heavy') {
                addStockRow('NVDA', 15); addStockRow('TSLA', 10); addStockRow('AMZN', 5);
            } else if (presetType === 'Global Split') {
                addStockRow('AAPL', 10); addStockRow('ASML', 4); addStockRow('TSM', 12);
            }
        });
    });

    // Model Selector Pill Listener
    document.querySelectorAll('.model-pill').forEach(pill => {
        pill.addEventListener('click', (e) => {
            document.querySelectorAll('.model-pill').forEach(p => p.classList.remove('active'));
            e.target.classList.add('active');
            
            activeModel = e.target.getAttribute('data-model');
            
            // Refresh table and summary metric cards for the selected model
            if (lastApiResponse) {
                displayResults(lastApiResponse);
            }

            // Re-render chart trajectory for the active asset
            if (selectedItemData) {
                renderChart(selectedItemData);
            }
        });
    });

    btnShowChart.addEventListener('click', () => {
        btnShowChart.classList.add('active');
        btnShowTable.classList.remove('active');
        chartSection.classList.remove('hidden');
        resultsSection.classList.add('hidden');
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

    if (resetLayoutBtn) {
        resetLayoutBtn.addEventListener('click', () => {
            portfolioList.innerHTML = '';
            addStockRow('AAPL', 10);
            addStockRow('MSFT', 5);
            weightSlider.value = 0;
            sliderValue.innerText = '0% Shift';
        });
    }

    analyzeBtn.addEventListener('click', async () => {
        analyzeBtn.innerHTML = "<span>Executing Models...</span>";
        analyzeBtn.disabled = true;

        const rows = document.querySelectorAll('.portfolio-row');
        const stocks = [];
        rows.forEach(row => {
            const sym = row.querySelector('.sym-input').value.trim().toUpperCase();
            const shares = parseFloat(row.querySelector('.share-input').value);
            if (sym && !isNaN(shares)) stocks.push({ symbol: sym, shares: shares });
        });

        if (stocks.length === 0) {
            alert("Please input at least one valid ticker and position size.");
            analyzeBtn.innerHTML = "<span>Execute Forecast Engine</span>";
            analyzeBtn.disabled = false;
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stocks: stocks })
            });
            
            if (!response.ok) throw new Error("Backend response error");
            const data = await response.json();
            
            lastApiResponse = data;
            globalPortfolioData = data.individual_results;
            rawSummaryData = data.summary;
            
            displayResults(data);
            
            const firstValid = globalPortfolioData.find(item => !item.error);
            if (firstValid) renderChart(firstValid);

        } catch (error) {
            alert("Connection Error. Ensure FastAPI backend is running.");
        } finally {
            analyzeBtn.innerHTML = "<span>Execute Forecast Engine</span>";
            analyzeBtn.disabled = false;
        }
    });

    function displayResults(data) {
        const formatMoney = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);

        let totalCurrentVal = 0.0;
        let totalPredictedVal = 0.0;

        const validItems = data.individual_results.filter(i => !i.error);

        // Dynamically compute totals based on the currently selected activeModel
        validItems.forEach(item => {
            const itemCurrent = item.current_price * item.shares;
            totalCurrentVal += itemCurrent;

            const modelData = item.models 
                ? item.models[activeModel] 
                : { predicted_price: item.predicted_price };
            
            totalPredictedVal += (modelData.predicted_price * item.shares);
        });

        const overallPctChange = totalCurrentVal > 0 
            ? ((totalPredictedVal - totalCurrentVal) / totalCurrentVal) * 100 
            : 0.0;

        document.getElementById('tot-current').innerText = formatMoney(totalCurrentVal);
        document.getElementById('tot-predicted').innerText = formatMoney(totalPredictedVal);
        
        const pctEl = document.getElementById('tot-change');
        pctEl.innerText = `${overallPctChange > 0 ? '+' : ''}${overallPctChange.toFixed(2)}%`;
        pctEl.className = overallPctChange >= 0 ? 'text-green' : 'text-red';

        const avgConfidence = validItems.length > 0
            ? validItems.reduce((acc, curr) => {
                const modelAcc = curr.models ? curr.models[activeModel].accuracy : curr.accuracy;
                return acc + modelAcc;
            }, 0) / validItems.length
            : 0;
        
        const avgConfidenceEl = document.getElementById('avg-confidence');
        if (avgConfidenceEl) avgConfidenceEl.innerText = `${avgConfidence.toFixed(1)}%`;

        const tbody = document.getElementById('results-body');
        tbody.innerHTML = '';
        
        data.individual_results.forEach(item => {
            const tr = document.createElement('tr');
            if (item.error) {
                tr.innerHTML = `<td colspan="6" class="text-red">${item.symbol}: ${item.error}</td>`;
            } else {
                const modelInfo = item.models ? item.models[activeModel] : {
                    predicted_price: item.predicted_price,
                    percentage_change: item.percentage_change,
                    accuracy: item.accuracy
                };
                const isPositive = modelInfo.percentage_change >= 0;
                tr.innerHTML = `
                    <td><strong>${item.symbol}</strong></td>
                    <td>${item.shares}</td>
                    <td>${formatMoney(item.current_price)}</td>
                    <td>${formatMoney(modelInfo.predicted_price)}</td>
                    <td class="${isPositive ? 'text-green' : 'text-red'}">${isPositive ? '+' : ''}${modelInfo.percentage_change.toFixed(2)}%</td>
                    <td><span class="badge">${modelInfo.accuracy.toFixed(1)}%</span></td>
                `;
                tr.addEventListener('click', () => {
                    renderChart(item);
                    btnShowChart.click();
                });
            }
            tbody.appendChild(tr);
        });
    }

    function renderChart(itemData) {
        selectedItemData = itemData;

        const modelData = itemData.models 
            ? itemData.models[activeModel] 
            : { predicted_price: itemData.predicted_price, accuracy: itemData.accuracy, name: "Linear Baseline" };

        document.getElementById('chart-title').innerText = `${itemData.symbol} Target Trajectory (${modelData.name})`;
        document.getElementById('chart-accuracy').innerText = `Model Confidence R²: ${modelData.accuracy.toFixed(1)}%`;

        lineSeries.setData(itemData.history);
        const lastHistorical = itemData.history[itemData.history.length - 1];
        
        predictedSeries.setData([
            lastHistorical,
            { time: itemData.prediction_date, value: modelData.predicted_price }
        ]);

        const trendColor = modelData.predicted_price >= lastHistorical.value ? '#00e676' : '#ff5252';
        predictedSeries.applyOptions({ color: trendColor });

        setTimeout(() => {
            const chartContainer = document.getElementById('tv-chart');
            if (chartContainer && chart) {
                chart.applyOptions({ width: chartContainer.clientWidth, height: chartContainer.clientHeight || 410 });
                chart.timeScale().fitContent();
            }
        }, 50);
    }

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

            const basePredicted = rawSummaryData.total_predicted_value;
            const simulatedPredicted = basePredicted * (1 + shiftPercent);
            const baseCurrent = rawSummaryData.total_current_value;
            const simulatedPctChange = ((simulatedPredicted - baseCurrent) / baseCurrent) * 100;

            document.getElementById('tot-predicted').innerText = formatMoney(simulatedPredicted);
            const pctEl = document.getElementById('tot-change');
            pctEl.innerText = `${simulatedPctChange > 0 ? '+' : ''}${simulatedPctChange.toFixed(2)}%`;
            pctEl.className = simulatedPctChange >= 0 ? 'text-green' : 'text-red';
        });
    }
});