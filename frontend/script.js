document.addEventListener('DOMContentLoaded', () => {
    // 1. Dynamic API Base URL Detection
    const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://127.0.0.1:8000'
        : 'https://portfolio-predictor-s6me.onrender.com';

    // 2. DOM Element References
    const btnUpstoxTab = document.getElementById('btn-upstox-tab');
    const btnDhanTab = document.getElementById('btn-dhan-tab');
    const upstoxPanel = document.getElementById('upstox-panel');
    const dhanPanel = document.getElementById('dhan-panel');
    const upstoxLoginBtn = document.getElementById('upstox-login-btn');
    const upstoxTokenInput = document.getElementById('upstox-token-input');
    const dhanClientIdInput = document.getElementById('dhan-client-id');
    const dhanTokenInput = document.getElementById('dhan-token-input');

    const modelTypeSelect = document.getElementById('model-type-select');
    const lookbackDaysSelect = document.getElementById('lookback-days-select');
    const analyzeBtn = document.getElementById('analyze-btn');
    const btnSpinner = document.getElementById('btn-spinner');
    const btnText = document.getElementById('btn-text');

    const portfolioList = document.getElementById('portfolio-list');
    const addBtn = document.getElementById('add-btn');

    const btnShowChart = document.getElementById('btn-show-chart');
    const btnShowTable = document.getElementById('btn-show-table');
    const chartSection = document.getElementById('chart-section');
    const resultsSection = document.getElementById('results-section');
    const resetLayoutBtn = document.getElementById('reset-layout-btn');

    const weightSlider = document.getElementById('weight-slider');
    const sliderValue = document.getElementById('slider-value');
    const simulateBtn = document.getElementById('simulate-btn');

    // 3. Application State Variables
    let activeBroker = 'upstox'; // 'upstox' or 'dhan'
    let lastSummaryData = null;
    let globalPortfolioData = [];
    let chart = null;
    let lineSeries = null;
    let predictedSeries = null;

    // Currency Formatter
    const formatINR = (val) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val || 0);

    // --- OAuth Callback Handler ---
    async function handleOAuthCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const authCode = urlParams.get('code');

        if (authCode) {
            btnText.innerText = "Exchanging Upstox Token...";
            btnSpinner.classList.remove('hidden');

            try {
                const response = await fetch(`${API_BASE_URL}/api/upstox/callback?code=${encodeURIComponent(authCode)}`);
                if (!response.ok) throw new Error("Failed to exchange Upstox authorization code.");
                
                const data = await response.json();
                if (data.access_token) {
                    upstoxTokenInput.value = data.access_token;
                    window.history.replaceState({}, document.title, window.location.pathname);
                    alert("Upstox OAuth login successful! Click 'Execute T+1 Forecast Engine' to run analytics.");
                }
            } catch (err) {
                alert(`OAuth Error: ${err.message}`);
            } finally {
                btnText.innerText = "Execute T+1 Forecast Engine";
                btnSpinner.classList.add('hidden');
            }
        }
    }

    handleOAuthCallback();

    // Upstox Login Redirect
    if (upstoxLoginBtn) {
        upstoxLoginBtn.addEventListener('click', async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/upstox/login`);
                if (!response.ok) throw new Error("Could not retrieve Upstox OAuth URL.");
                const data = await response.json();
                if (data.authorization_url) {
                    window.location.href = data.authorization_url;
                }
            } catch (err) {
                alert(`Login Redirect Error: ${err.message}`);
            }
        });
    }

    // --- Broker Tab Switching ---
    if (btnUpstoxTab && btnDhanTab) {
        btnUpstoxTab.addEventListener('click', () => {
            activeBroker = 'upstox';
            btnUpstoxTab.className = "broker-tab py-1.5 rounded-md bg-blue-600 text-white transition text-center font-semibold";
            btnDhanTab.className = "broker-tab py-1.5 rounded-md text-slate-400 hover:text-white transition text-center";
            upstoxPanel.classList.remove('hidden');
            dhanPanel.classList.add('hidden');
        });

        btnDhanTab.addEventListener('click', () => {
            activeBroker = 'dhan';
            btnDhanTab.className = "broker-tab py-1.5 rounded-md bg-blue-600 text-white transition text-center font-semibold";
            btnUpstoxTab.className = "broker-tab py-1.5 rounded-md text-slate-400 hover:text-white transition text-center";
            dhanPanel.classList.remove('hidden');
            upstoxPanel.classList.add('hidden');
        });
    }

    // --- TradingView Lightweight Charts Setup ---
    function initChart() {
        const chartContainer = document.getElementById('tv-chart');
        if (!chartContainer) return;

        chartContainer.innerHTML = ''; // Clear prior canvas

        chart = LightweightCharts.createChart(chartContainer, {
            width: chartContainer.clientWidth || 600,
            height: chartContainer.clientHeight || 340,
            layout: {
                background: { type: 'solid', color: '#0f172a' },
                textColor: '#94a3b8',
                fontFamily: "'JetBrains Mono', monospace",
            },
            grid: {
                vertLines: { color: '#1e293b' },
                horzLines: { color: '#1e293b' },
            },
            crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
            timeScale: { borderColor: '#334155', timeVisible: true, secondsVisible: false },
            rightPriceScale: { borderColor: '#334155' }
        });

        lineSeries = chart.addLineSeries({ color: '#3b82f6', lineWidth: 2, crosshairMarkerRadius: 5 });
        predictedSeries = chart.addLineSeries({ color: '#10b981', lineWidth: 2, lineStyle: LightweightCharts.LineStyle.Dotted });

        const resizeChart = () => {
            if (chartContainer && chartContainer.clientWidth > 0 && chart) {
                chart.applyOptions({
                    width: chartContainer.clientWidth,
                    height: chartContainer.clientHeight || 340
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

    // --- Manual Asset Override Helper ---
    function addStockRow(symbol = '', shares = '') {
        const row = document.createElement('div');
        row.className = 'flex items-center gap-2';
        row.innerHTML = `
            <input type="text" placeholder="RELIANCE.NS" value="${symbol}" class="sym-input w-2/3 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500">
            <input type="number" placeholder="Qty" value="${shares}" class="share-input w-1/3 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500">
            <button class="remove-btn text-slate-500 hover:text-red-400 text-xs px-1">✖</button>
        `;
        row.querySelector('.remove-btn').addEventListener('click', () => row.remove());
        portfolioList.appendChild(row);
    }

    if (addBtn) addBtn.addEventListener('click', () => addStockRow('', ''));

    // Populate initial manual rows
    addStockRow('RELIANCE.NS', '10');
    addStockRow('TCS.NS', '5');

    // --- Navigation & Workspace Controls ---
    btnShowChart.addEventListener('click', () => {
        btnShowChart.classList.add('bg-slate-800', 'text-white', 'border', 'border-slate-700');
        btnShowChart.classList.remove('text-slate-400');
        btnShowTable.classList.remove('bg-slate-800', 'text-white', 'border', 'border-slate-700');
        btnShowTable.classList.add('text-slate-400');
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
        btnShowTable.classList.add('bg-slate-800', 'text-white', 'border', 'border-slate-700');
        btnShowTable.classList.remove('text-slate-400');
        btnShowChart.classList.remove('bg-slate-800', 'text-white', 'border', 'border-slate-700');
        btnShowChart.classList.add('text-slate-400');
        resultsSection.classList.remove('hidden');
        chartSection.classList.add('hidden');
    });

    if (resetLayoutBtn) {
        resetLayoutBtn.addEventListener('click', () => {
            portfolioList.innerHTML = '';
            addStockRow('RELIANCE.NS', '10');
            addStockRow('TCS.NS', '5');
            weightSlider.value = 0;
            sliderValue.innerText = '0% Shift';
        });
    }

    // --- Execute ML Sync & Prediction Engine ---
    analyzeBtn.addEventListener('click', async () => {
        let token = '';
        let clientId = null;

        if (activeBroker === 'upstox') {
            token = upstoxTokenInput.value.trim();
        } else if (activeBroker === 'dhan') {
            clientId = dhanClientIdInput.value.trim();
            token = dhanTokenInput.value.trim();
        }

        // If no broker credentials entered, run single-stock prediction fallback using manual inputs
        if (!token) {
            const manualInputs = Array.from(portfolioList.querySelectorAll('.flex')).map(row => ({
                symbol: row.querySelector('.sym-input').value.trim(),
                shares: parseFloat(row.querySelector('.share-input').value) || 1
            })).filter(item => item.symbol !== '');

            if (manualInputs.length === 0) {
                alert("Please connect a broker or add at least one stock symbol in Manual Override.");
                return;
            }

            btnText.innerText = "Running Single-Stock ML Engine...";
            btnSpinner.classList.remove('hidden');
            analyzeBtn.disabled = true;

            try {
                const target = manualInputs[0];
                const response = await fetch(`${API_BASE_URL}/api/predict-stock`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        symbol: target.symbol,
                        shares: target.shares,
                        lookback_days: parseInt(lookbackDaysSelect.value, 10)
                    })
                });

                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.detail || "Single stock prediction error");
                }

                const resData = await response.json();
                const item = resData.data;

                globalPortfolioData = [item];
                lastSummaryData = {
                    total_current_value: item.current_price * item.shares,
                    total_predicted_value: item.predicted_price * item.shares,
                    portfolio_percentage_change: item.percentage_change,
                    avg_accuracy: item.accuracy
                };

                displayResults({ portfolio_summary: lastSummaryData, individual_results: globalPortfolioData });
                renderChart(item);

            } catch (err) {
                alert(`Manual Prediction Failure: ${err.message}`);
            } finally {
                btnText.innerText = "Execute T+1 Forecast Engine";
                btnSpinner.classList.add('hidden');
                analyzeBtn.disabled = false;
            }
            return;
        }

        // Broker Sync Execution
        const payload = {
            broker: activeBroker,
            access_token: token,
            client_id: clientId,
            model_type: modelTypeSelect.value,
            lookback_days: parseInt(lookbackDaysSelect.value, 10)
        };

        btnText.innerText = "Syncing Broker & Executing Analytics...";
        btnSpinner.classList.remove('hidden');
        analyzeBtn.disabled = true;

        try {
            const response = await fetch(`${API_BASE_URL}/api/sync-and-analyze`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || "Server pipeline error");
            }

            const resData = await response.json();
            const analyticsData = resData.data;

            if (!analyticsData || !analyticsData.individual_results) {
                alert("No holdings found or analysis returned empty payload.");
                return;
            }

            globalPortfolioData = analyticsData.individual_results;
            lastSummaryData = analyticsData.portfolio_summary;

            displayResults(analyticsData);

            const firstValid = globalPortfolioData.find(item => !item.error);
            if (firstValid) renderChart(firstValid);

        } catch (error) {
            alert(`Analysis Failure: ${error.message}`);
        } finally {
            btnText.innerText = "Execute T+1 Forecast Engine";
            btnSpinner.classList.add('hidden');
            analyzeBtn.disabled = false;
        }
    });

    // --- Render Metric Cards & Positions Table ---
    function displayResults(analyticsData) {
        const summary = analyticsData.portfolio_summary || {};
        
        document.getElementById('tot-current').innerText = formatINR(summary.total_current_value || 0);
        document.getElementById('tot-predicted').innerText = formatINR(summary.total_predicted_value || 0);

        const pctEl = document.getElementById('tot-change');
        const pctVal = summary.portfolio_percentage_change || 0;
        pctEl.innerText = `${pctVal >= 0 ? '+' : ''}${pctVal.toFixed(2)}%`;
        pctEl.className = `text-xl font-bold font-mono mt-1 ${pctVal >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;

        const avgConfidenceEl = document.getElementById('avg-confidence');
        if (avgConfidenceEl) {
            avgConfidenceEl.innerText = `${(summary.avg_accuracy || 0).toFixed(1)}%`;
        }

        const tbody = document.getElementById('results-body');
        tbody.innerHTML = '';

        analyticsData.individual_results.forEach(item => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-800/50 cursor-pointer transition";

            if (item.error) {
                tr.innerHTML = `<td colspan="6" class="py-3 text-rose-400 font-sans">${item.symbol}: ${item.error}</td>`;
            } else {
                const isPositive = item.percentage_change >= 0;
                tr.innerHTML = `
                    <td class="py-3 font-bold text-slate-100">${item.symbol}</td>
                    <td class="py-3">${item.shares}</td>
                    <td class="py-3">${formatINR(item.current_price)}</td>
                    <td class="py-3 text-blue-400 font-semibold">${formatINR(item.predicted_price)}</td>
                    <td class="py-3 font-semibold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}">
                        ${isPositive ? '+' : ''}${item.percentage_change.toFixed(2)}%
                    </td>
                    <td class="py-3">
                        <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            ${(item.accuracy || 0).toFixed(1)}%
                        </span>
                    </td>
                `;
                tr.addEventListener('click', () => {
                    renderChart(item);
                    btnShowChart.click();
                });
            }
            tbody.appendChild(tr);
        });
    }

    // --- Render Stock Price Trajectory Chart ---
    function renderChart(itemData) {
        document.getElementById('chart-title').innerText = `${itemData.symbol} Target Trajectory`;
        document.getElementById('chart-accuracy').innerText = `R² Confidence: ${(itemData.accuracy || 0).toFixed(1)}%`;

        if (!itemData.history || itemData.history.length === 0) return;

        lineSeries.setData(itemData.history);
        const lastHistorical = itemData.history[itemData.history.length - 1];

        predictedSeries.setData([
            lastHistorical,
            { time: itemData.prediction_date, value: itemData.predicted_price }
        ]);

        const trendColor = itemData.predicted_price >= lastHistorical.value ? '#10b981' : '#f43f5e';
        predictedSeries.applyOptions({ color: trendColor });

        setTimeout(() => {
            const chartContainer = document.getElementById('tv-chart');
            if (chartContainer && chart) {
                chart.applyOptions({
                    width: chartContainer.clientWidth,
                    height: chartContainer.clientHeight || 340
                });
                chart.timeScale().fitContent();
            }
        }, 50);
    }

    // --- What-If Stress Testing Simulator ---
    if (weightSlider) {
        weightSlider.addEventListener('input', (e) => {
            const shiftVal = parseInt(e.target.value, 10);
            sliderValue.innerText = `${shiftVal > 0 ? '+' : ''}${shiftVal}% Shift`;
        });
    }

    if (simulateBtn) {
        simulateBtn.addEventListener('click', () => {
            if (!lastSummaryData) {
                alert("Please execute a forecast or single-stock prediction first.");
                return;
            }

            const shiftPercent = parseFloat(weightSlider.value) / 100;
            const basePredicted = lastSummaryData.total_predicted_value;
            const simulatedPredicted = basePredicted * (1 + shiftPercent);
            const baseCurrent = lastSummaryData.total_current_value;
            const simulatedPctChange = baseCurrent > 0 ? ((simulatedPredicted - baseCurrent) / baseCurrent) * 100 : 0;

            document.getElementById('tot-predicted').innerText = formatINR(simulatedPredicted);
            const pctEl = document.getElementById('tot-change');
            pctEl.innerText = `${simulatedPctChange >= 0 ? '+' : ''}${simulatedPctChange.toFixed(2)}%`;
            pctEl.className = `text-xl font-bold font-mono mt-1 ${simulatedPctChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
        });
    }
});