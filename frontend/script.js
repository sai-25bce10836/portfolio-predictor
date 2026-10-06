document.addEventListener('DOMContentLoaded', () => {
    // 1. Dynamic API Base URL Detection
    const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        ? 'http://127.0.0.1:8000'
        : 'https://portfolio-predictor-s6me.onrender.com';

    // 2. DOM Element References
    const upstoxLoginBtn = document.getElementById('upstox-login-btn');
    const upstoxTokenInput = document.getElementById('upstox-token-input');

    const modelTypeSelect = document.getElementById('model-type-select');
    const lookbackDaysSelect = document.getElementById('lookback-days-select');
    const analyzeBtn = document.getElementById('analyze-btn');
    const manualAnalyzeBtn = document.getElementById('manual-analyze-btn');
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
    let lastSummaryData = null;
    let globalPortfolioData = [];
    let chart = null;
    let lineSeries = null;
    let predictedSeries = null;

    // Currency Formatter
    const formatINR = (val) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val || 0);

    // --- Direct Input Extraction Helper ---
    function getManualInputs() {
        if (!portfolioList) return [];

        const items = [];
        const rows = portfolioList.querySelectorAll('.portfolio-row');

        rows.forEach(row => {
            const symInput = row.querySelector('.sym-input, input[type="text"]');
            const shareInput = row.querySelector('.share-input, input[type="number"]');

            const rawSymbol = symInput && symInput.value ? symInput.value.trim() : '';
            if (rawSymbol !== '') {
                const sharesVal = shareInput ? (parseFloat(shareInput.value) || 1) : 1;
                items.push({
                    symbol: rawSymbol.toUpperCase(),
                    quantity: sharesVal
                });
            }
        });

        return items;
    }

    // --- OAuth Callback Handler ---
    async function handleOAuthCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const authCode = urlParams.get('code');

        if (authCode) {
            if (btnText) btnText.innerText = "Exchanging Upstox Token...";
            if (btnSpinner) btnSpinner.classList.remove('hidden');

            try {
                const response = await fetch(`${API_BASE_URL}/api/v1/auth/upstox/callback?code=${encodeURIComponent(authCode)}`);
                if (!response.ok) throw new Error("Failed to exchange Upstox authorization code.");
                
                const data = await response.json();
                if (data.access_token) {
                    if (upstoxTokenInput) upstoxTokenInput.value = data.access_token;
                    window.history.replaceState({}, document.title, window.location.pathname);
                    alert("Upstox OAuth login successful! Click 'Execute T+1 Forecast Engine' to run analytics.");
                }
            } catch (err) {
                alert(`OAuth Error: ${err.message}`);
            } finally {
                if (btnText) btnText.innerText = "Execute T+1 Forecast Engine";
                if (btnSpinner) btnSpinner.classList.add('hidden');
            }
        }
    }

    handleOAuthCallback();

    // Upstox Login Redirect
    if (upstoxLoginBtn) {
        upstoxLoginBtn.addEventListener('click', async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/v1/auth/upstox/login`);
                if (!response.ok) throw new Error(`Could not retrieve Upstox OAuth URL (Status: ${response.status})`);
                const data = await response.json();
                
                const authUrl = data.authorization_url || data.url;
                if (authUrl) {
                    window.location.href = authUrl;
                } else {
                    throw new Error("No authorization URL received from server.");
                }
            } catch (err) {
                alert(`Login Redirect Error: ${err.message}`);
            }
        });
    }

    // --- TradingView Lightweight Charts Setup ---
    function initChart() {
        const chartContainer = document.getElementById('tv-chart');
        if (!chartContainer || typeof LightweightCharts === 'undefined') return;

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

    // --- Manual Asset Row Injector ---
    function addStockRow(symbol = '', shares = '') {
        if (!portfolioList) return;
        const row = document.createElement('div');
        row.className = 'portfolio-row flex items-center gap-2 mb-2';
        row.innerHTML = `
            <input type="text" placeholder="RELIANCE.NS" value="${symbol}" class="sym-input w-2/3 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500 uppercase">
            <input type="number" placeholder="Qty" value="${shares}" class="share-input w-1/3 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500">
            <button class="remove-btn text-slate-500 hover:text-red-400 text-xs px-1">✖</button>
        `;
        row.querySelector('.remove-btn').addEventListener('click', () => row.remove());
        portfolioList.appendChild(row);
    }

    if (addBtn) addBtn.addEventListener('click', () => addStockRow('', '1'));

    // Populate default initial manual rows
    if (portfolioList) portfolioList.innerHTML = '';
    addStockRow('RELIANCE.NS', '10');
    addStockRow('TCS.NS', '5');

    // --- Navigation & Workspace Controls ---
    if (btnShowChart && btnShowTable) {
        btnShowChart.addEventListener('click', () => {
            btnShowChart.classList.add('bg-slate-800', 'text-white', 'border', 'border-slate-700');
            btnShowChart.classList.remove('text-slate-400');
            btnShowTable.classList.remove('bg-slate-800', 'text-white', 'border', 'border-slate-700');
            btnShowTable.classList.add('text-slate-400');
            if (chartSection) chartSection.classList.remove('hidden');
            if (resultsSection) resultsSection.classList.add('hidden');
            
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
            if (resultsSection) resultsSection.classList.remove('hidden');
            if (chartSection) chartSection.classList.add('hidden');
        });
    }

    if (resetLayoutBtn) {
        resetLayoutBtn.addEventListener('click', () => {
            if (portfolioList) portfolioList.innerHTML = '';
            addStockRow('RELIANCE.NS', '10');
            addStockRow('TCS.NS', '5');
            if (weightSlider) weightSlider.value = 0;
            if (sliderValue) sliderValue.innerText = '0% Shift';
        });
    }

    // --- Core Execution: Manual Portfolio Engine ---
    async function runManualEngine() {
        const manualInputs = getManualInputs();
        const lookbackDays = parseInt(lookbackDaysSelect ? lookbackDaysSelect.value : 90, 10);
        const modelType = modelTypeSelect ? modelTypeSelect.value : 'linear';

        if (!manualInputs || manualInputs.length === 0) {
            alert("No tickers found. Please type a ticker symbol into the input field (e.g. RELIANCE.NS).");
            return;
        }

        if (btnText) btnText.innerText = "Running Manual Portfolio Engine...";
        if (btnSpinner) btnSpinner.classList.remove('hidden');
        if (manualAnalyzeBtn) manualAnalyzeBtn.disabled = true;
        if (analyzeBtn) analyzeBtn.disabled = true;

        const payload = {
            holdings: manualInputs,
            model_type: modelType,
            lookback_days: lookbackDays
        };

        try {
            const response = await fetch(`${API_BASE_URL}/api/v1/predict-stock`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const resJson = await response.json();
            if (!response.ok) {
                throw new Error(resJson.detail || `HTTP ${response.status}`);
            }

            const analyticsData = resJson.data;
            if (!analyticsData || !analyticsData.holdings) {
                alert("Analysis returned an empty or invalid payload.");
                return;
            }

            globalPortfolioData = analyticsData.holdings;
            lastSummaryData = analyticsData.summary;

            displayResults(analyticsData);
            
            const firstValid = globalPortfolioData.find(item => !item.error);
            if (firstValid) renderChart(firstValid);

        } catch (err) {
            alert(`Manual Prediction Failure: ${err.message}`);
        } finally {
            if (btnText) btnText.innerText = "Execute T+1 Forecast Engine";
            if (btnSpinner) btnSpinner.classList.add('hidden');
            if (manualAnalyzeBtn) manualAnalyzeBtn.disabled = false;
            if (analyzeBtn) analyzeBtn.disabled = false;
        }
    }

    if (manualAnalyzeBtn) {
        manualAnalyzeBtn.addEventListener('click', runManualEngine);
    }

    // --- Core Execution: Upstox OAuth Engine ---
    if (analyzeBtn) {
        analyzeBtn.addEventListener('click', async () => {
            const token = upstoxTokenInput ? upstoxTokenInput.value.trim() : '';
            const lookbackDays = parseInt(lookbackDaysSelect ? lookbackDaysSelect.value : 90, 10);

            // Fallback to manual execution if no token is provided
            if (!token) {
                await runManualEngine();
                return;
            }

            const payload = {
                broker: 'upstox',
                access_token: token,
                model_type: modelTypeSelect ? modelTypeSelect.value : 'linear',
                lookback_days: lookbackDays
            };

            if (btnText) btnText.innerText = "Syncing Upstox & Executing Analytics...";
            if (btnSpinner) btnSpinner.classList.remove('hidden');
            analyzeBtn.disabled = true;

            try {
                const response = await fetch(`${API_BASE_URL}/api/v1/sync-and-analyze`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.detail || `Server returned status ${response.status}`);
                }

                const resData = await response.json();
                const analyticsData = resData.data;

                if (!analyticsData || !analyticsData.holdings) {
                    alert("No holdings found or analysis returned empty payload.");
                    return;
                }

                globalPortfolioData = analyticsData.holdings;
                lastSummaryData = analyticsData.summary;

                displayResults(analyticsData);

                const firstValid = globalPortfolioData.find(item => !item.error);
                if (firstValid) renderChart(firstValid);

            } catch (error) {
                alert(`Analysis Failure: ${error.message}`);
            } finally {
                if (btnText) btnText.innerText = "Execute T+1 Forecast Engine";
                if (btnSpinner) btnSpinner.classList.add('hidden');
                analyzeBtn.disabled = false;
            }
        });
    }

    // --- Render Metric Cards & Positions Table ---
    function displayResults(analyticsData) {
        const summary = analyticsData.summary || {};
        
        const totCurrentEl = document.getElementById('tot-current');
        const totPredictedEl = document.getElementById('tot-predicted');
        if (totCurrentEl) totCurrentEl.innerText = formatINR(summary.total_current_nav || 0);
        if (totPredictedEl) totPredictedEl.innerText = formatINR(summary.total_projected_nav || 0);

        const pctEl = document.getElementById('tot-change');
        if (pctEl) {
            const pctVal = summary.portfolio_alpha_pct || 0;
            pctEl.innerText = `${pctVal >= 0 ? '+' : ''}${pctVal.toFixed(2)}%`;
            pctEl.className = `text-xl font-bold font-mono mt-1 ${pctVal >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
        }

        const avgConfidenceEl = document.getElementById('avg-confidence');
        if (avgConfidenceEl) {
            const r2Val = (summary.average_r2_confidence || 0) * 100;
            avgConfidenceEl.innerText = `${r2Val.toFixed(1)}%`;
        }

        const tbody = document.getElementById('results-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const holdings = analyticsData.holdings || [];
        holdings.forEach(item => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-slate-800/50 cursor-pointer transition";

            if (item.error) {
                tr.innerHTML = `<td colspan="6" class="py-3 text-rose-400 font-sans">${item.symbol}: ${item.error}</td>`;
            } else {
                const changePct = item.expected_change_pct || 0;
                const isPositive = changePct >= 0;
                tr.innerHTML = `
                    <td class="py-3 font-bold text-slate-100">${item.symbol}</td>
                    <td class="py-3">${item.quantity}</td>
                    <td class="py-3">${formatINR(item.current_price)}</td>
                    <td class="py-3 text-blue-400 font-semibold">${formatINR(item.target_price_t1)}</td>
                    <td class="py-3 font-semibold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}">
                        ${isPositive ? '+' : ''}${changePct.toFixed(2)}%
                    </td>
                    <td class="py-3">
                        <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            ${((item.model_r2_score || 0) * 100).toFixed(1)}%
                        </span>
                    </td>
                `;
                tr.addEventListener('click', () => {
                    renderChart(item);
                    if (btnShowChart) btnShowChart.click();
                });
            }
            tbody.appendChild(tr);
        });
    }

    // --- Render Stock Price Trajectory Chart ---
    function renderChart(itemData) {
        const chartTitle = document.getElementById('chart-title');
        const chartAccuracy = document.getElementById('chart-accuracy');
        if (chartTitle) chartTitle.innerText = `${itemData.symbol} Target Trajectory`;
        if (chartAccuracy) chartAccuracy.innerText = `R² Confidence: ${((itemData.model_r2_score || 0) * 100).toFixed(1)}%`;

        if (!itemData.history || itemData.history.length === 0 || !lineSeries || !predictedSeries) return;

        lineSeries.setData(itemData.history);
        const lastHistorical = itemData.history[itemData.history.length - 1];

        predictedSeries.setData([
            lastHistorical,
            { time: itemData.prediction_date, value: itemData.target_price_t1 }
        ]);

        const trendColor = itemData.target_price_t1 >= lastHistorical.value ? '#10b981' : '#f43f5e';
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
            if (sliderValue) sliderValue.innerText = `${shiftVal > 0 ? '+' : ''}${shiftVal}% Shift`;
        });
    }

    if (simulateBtn) {
        simulateBtn.addEventListener('click', () => {
            if (!lastSummaryData || lastSummaryData.total_current_nav === 0) {
                alert("Please execute a valid forecast with active portfolio results first.");
                return;
            }

            const shiftPercent = parseFloat(weightSlider ? weightSlider.value : 0) / 100;
            const basePredicted = lastSummaryData.total_projected_nav;
            const simulatedPredicted = basePredicted * (1 + shiftPercent);
            const baseCurrent = lastSummaryData.total_current_nav;
            const simulatedPctChange = baseCurrent > 0 ? ((simulatedPredicted - baseCurrent) / baseCurrent) * 100 : 0;

            const totPredictedEl = document.getElementById('tot-predicted');
            if (totPredictedEl) totPredictedEl.innerText = formatINR(simulatedPredicted);
            
            const pctEl = document.getElementById('tot-change');
            if (pctEl) {
                pctEl.innerText = `${simulatedPctChange >= 0 ? '+' : ''}${simulatedPctChange.toFixed(2)}%`;
                pctEl.className = `text-xl font-bold font-mono mt-1 ${simulatedPctChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
            }
        });
    }
});