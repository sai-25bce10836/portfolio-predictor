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

    // Theme Toggle
    const themeToggle = document.getElementById('theme-toggle');

    // Scenario Modal Elements
    const openScenarioBtn = document.getElementById('open-scenario-btn');
    const closeScenarioBtn = document.getElementById('close-scenario-btn');
    const scenarioModal = document.getElementById('scenario-modal');

    const weightSlider = document.getElementById('weight-slider');
    const sliderValue = document.getElementById('slider-value');
    const simulateBtn = document.getElementById('simulate-btn');

    const scenarioCurrentNav = document.getElementById('scenario-current-nav');
    const scenarioBaseNav = document.getElementById('scenario-base-nav');
    const scenarioResultNav = document.getElementById('scenario-result-nav');
    const scenarioImpact = document.getElementById('scenario-impact');
    const scenarioReturn = document.getElementById('scenario-return');
    const scenarioStatus = document.getElementById('scenario-status');

    // 3. Application State Variables
    let lastSummaryData = null;
    let globalPortfolioData = [];
    let chart = null;
    let lineSeries = null;
    let candlestickSeries = null;
    let barSeries = null;
    let areaSeries = null;
    let predictedSeries = null;
    let currentChartType =
        localStorage.getItem('profolio-chart-type') || 'line';

    // =========================================================
    // THEME MANAGEMENT
    // =========================================================

    function applyTheme(theme) {
        const isLight = theme === 'light';

        document.body.classList.toggle('light-theme', isLight);

        const root = document.documentElement;
        root.classList.toggle('dark', !isLight);
        root.classList.toggle('light', isLight);

        if (themeToggle) {
            themeToggle.setAttribute(
                'aria-label',
                isLight ? 'Switch to dark theme' : 'Switch to light theme'
            );

            themeToggle.setAttribute(
                'title',
                isLight ? 'Switch to dark theme' : 'Switch to light theme'
            );
        }

        localStorage.setItem(
            'profolio-theme',
            isLight ? 'light' : 'dark'
        );

        updateChartTypeControl();

        // Keep the TradingView chart visually consistent with the selected theme.
        if (chart) {
            const chartColors = isLight
                ? {
                    background: '#f8f9fb',
                    text: '#475467',
                    grid: '#e4e7ec',
                    border: '#cbd1d9'
                }
                : {
                    background: '#0f172a',
                    text: '#94a3b8',
                    grid: '#1e293b',
                    border: '#334155'
                };

            chart.applyOptions({
                layout: {
                    background: {
                        type: 'solid',
                        color: chartColors.background
                    },
                    textColor: chartColors.text
                },

                grid: {
                    vertLines: {
                        color: chartColors.grid
                    },

                    horzLines: {
                        color: chartColors.grid
                    }
                },

                timeScale: {
                    borderColor: chartColors.border
                },

                rightPriceScale: {
                    borderColor: chartColors.border
                }
            });
        }
    }

    function initializeTheme() {
        const savedTheme =
            localStorage.getItem('profolio-theme');

        // Dark remains the default theme.
        applyTheme(
            savedTheme === 'light'
                ? 'light'
                : 'dark'
        );
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {

            const isCurrentlyLight =
                document.body.classList.contains('light-theme');

            applyTheme(
                isCurrentlyLight
                    ? 'dark'
                    : 'light'
            );
        });
    }

    initializeTheme();

    // Currency Formatter
    const formatINR = (val) => new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR'
    }).format(val || 0);

    // --- Direct Input Extraction Helper ---
    function getManualInputs() {

        if (!portfolioList) return [];

        const items = [];

        const rows =
            portfolioList.querySelectorAll(
                '.portfolio-row'
            );

        rows.forEach(row => {

            const symInput =
                row.querySelector(
                    '.sym-input, input[type="text"]'
                );

            const shareInput =
                row.querySelector(
                    '.share-input, input[type="number"]'
                );

            const rawSymbol =
                symInput && symInput.value
                    ? symInput.value.trim()
                    : '';

            if (rawSymbol !== '') {

                const sharesVal =
                    shareInput
                        ? (parseFloat(shareInput.value) || 1)
                        : 1;

                items.push({
                    symbol: rawSymbol.toUpperCase(),
                    quantity: sharesVal
                });
            }
        });

        return items;
    }

    // =========================================================
    // OAUTH CALLBACK HANDLER
    // =========================================================

    async function handleOAuthCallback() {

        const urlParams =
            new URLSearchParams(
                window.location.search
            );

        const authCode =
            urlParams.get('code');

        if (authCode) {

            if (btnText) {
                btnText.innerText =
                    "Exchanging Upstox Token...";
            }

            if (btnSpinner) {
                btnSpinner.classList.remove('hidden');
            }

            try {

                const response = await fetch(
                    `${API_BASE_URL}/api/v1/auth/upstox/callback?code=${encodeURIComponent(authCode)}`
                );

                if (!response.ok) {
                    throw new Error(
                        "Failed to exchange Upstox authorization code."
                    );
                }

                const data =
                    await response.json();

                if (data.access_token) {

                    if (upstoxTokenInput) {
                        upstoxTokenInput.value =
                            data.access_token;
                    }

                    window.history.replaceState(
                        {},
                        document.title,
                        window.location.pathname
                    );

                    alert(
                        "Upstox OAuth login successful! Click 'Execute T+1 Forecast Engine' to run analytics."
                    );
                }

            } catch (err) {

                alert(
                    `OAuth Error: ${err.message}`
                );

            } finally {

                if (btnText) {
                    btnText.innerText =
                        "Execute T+1 Forecast Engine";
                }

                if (btnSpinner) {
                    btnSpinner.classList.add('hidden');
                }
            }
        }
    }

    handleOAuthCallback();

    // =========================================================
    // UPSTOX LOGIN REDIRECT
    // =========================================================

    if (upstoxLoginBtn) {

        upstoxLoginBtn.addEventListener(
            'click',
            async () => {

                try {

                    const response =
                        await fetch(
                            `${API_BASE_URL}/api/v1/auth/upstox/login`
                        );

                    if (!response.ok) {

                        throw new Error(
                            `Could not retrieve Upstox OAuth URL (Status: ${response.status})`
                        );
                    }

                    const data =
                        await response.json();

                    const authUrl =
                        data.authorization_url ||
                        data.url;

                    if (authUrl) {

                        window.location.href =
                            authUrl;

                    } else {

                        throw new Error(
                            "No authorization URL received from server."
                        );
                    }

                } catch (err) {

                    alert(
                        `Login Redirect Error: ${err.message}`
                    );
                }
            }
        );
    }

    // =========================================================
    // SAFE CHART CANVAS RESIZE LOGIC
    // =========================================================

    function resizeChartCanvas() {

        const chartContainer =
            document.getElementById(
                'tv-chart'
            );

        if (chartContainer && chart) {

            const width =
                chartContainer.clientWidth || 600;

            const height =
                chartContainer.clientHeight > 0
                    ? chartContainer.clientHeight
                    : 340;

            chart.applyOptions({
                width,
                height
            });

            chart.timeScale().fitContent();
        }
    }

    // =========================================================
    // TRADINGVIEW LIGHTWEIGHT CHARTS SETUP
    // =========================================================

    // =========================================================
    // CHART TYPE MANAGEMENT
    // =========================================================

    function createChartTypeControl() {

        const chartContainer =
            document.getElementById('tv-chart');

        if (!chartContainer) return;

        let control =
            document.getElementById('chart-type-control');

        if (!control) {

            control =
                document.createElement('div');

            control.id =
                'chart-type-control';

            control.className =
                'flex items-center gap-1 p-1 rounded-lg border border-slate-700 bg-slate-900/80 mb-2 w-fit';

            control.innerHTML = `
                <span class="px-2 text-[10px] uppercase tracking-wider text-slate-400 font-mono hidden sm:inline">
                    Chart
                </span>

                <button
                    type="button"
                    data-chart-type="line"
                    class="chart-type-btn px-2.5 py-1.5 rounded-md text-[11px] font-mono transition"
                    title="Line chart"
                >
                    Line
                </button>

                <button
                    type="button"
                    data-chart-type="candlestick"
                    class="chart-type-btn px-2.5 py-1.5 rounded-md text-[11px] font-mono transition"
                    title="Candlestick chart"
                >
                    Candles
                </button>

                <button
                    type="button"
                    data-chart-type="bar"
                    class="chart-type-btn px-2.5 py-1.5 rounded-md text-[11px] font-mono transition"
                    title="OHLC bar chart"
                >
                    Bar
                </button>

                <button
                    type="button"
                    data-chart-type="area"
                    class="chart-type-btn px-2.5 py-1.5 rounded-md text-[11px] font-mono transition"
                    title="Area chart"
                >
                    Area
                </button>
            `;

            chartContainer.parentNode.insertBefore(
                control,
                chartContainer
            );

            control
                .querySelectorAll('.chart-type-btn')
                .forEach(button => {

                    button.addEventListener(
                        'click',
                        () => {
                            applyChartType(
                                button.dataset.chartType
                            );
                        }
                    );
                });
        }

        updateChartTypeControl();
    }

    function updateChartTypeControl() {

        const control =
            document.getElementById(
                'chart-type-control'
            );

        if (!control) return;

        const isLight =
            document.body.classList.contains(
                'light-theme'
            );

        control.style.background =
            isLight
                ? 'rgba(255, 255, 255, 0.92)'
                : 'rgba(15, 23, 42, 0.80)';

        control.style.borderColor =
            isLight
                ? '#dfe3e8'
                : '#334155';

        control
            .querySelectorAll('.chart-type-btn')
            .forEach(button => {

                const active =
                    button.dataset.chartType ===
                    currentChartType;

                button.style.background =
                    active
                        ? (
                            isLight
                                ? '#315bb5'
                                : '#334155'
                        )
                        : 'transparent';

                button.style.color =
                    active
                        ? '#ffffff'
                        : (
                            isLight
                                ? '#475467'
                                : '#94a3b8'
                        );
            });

        const label =
            control.querySelector('span');

        if (label) {
            label.style.color =
                isLight
                    ? '#667085'
                    : '#94a3b8';
        }
    }

    function applyChartType(type) {

        const validTypes = [
            'line',
            'candlestick',
            'bar',
            'area'
        ];

        if (!validTypes.includes(type)) {
            type = 'line';
        }

        currentChartType = type;

        localStorage.setItem(
            'profolio-chart-type',
            currentChartType
        );

        if (lineSeries) {
            lineSeries.applyOptions({
                visible:
                    currentChartType === 'line'
            });
        }

        if (candlestickSeries) {
            candlestickSeries.applyOptions({
                visible:
                    currentChartType === 'candlestick'
            });
        }

        if (barSeries) {
            barSeries.applyOptions({
                visible:
                    currentChartType === 'bar'
            });
        }

        if (areaSeries) {
            areaSeries.applyOptions({
                visible:
                    currentChartType === 'area'
            });
        }

        // The T+1 forecast remains visible regardless
        // of which historical chart type is selected.
        if (predictedSeries) {
            predictedSeries.applyOptions({
                visible: true
            });
        }

        updateChartTypeControl();

        if (chart) {
            requestAnimationFrame(() => {
                resizeChartCanvas();
            });
        }
    }

    function applyChartSeriesTheme(isLight) {

        if (lineSeries) {
            lineSeries.applyOptions({
                color:
                    isLight
                        ? '#315bb5'
                        : '#3b82f6'
            });
        }

        if (candlestickSeries) {
            candlestickSeries.applyOptions({

                upColor:
                    isLight
                        ? '#0f8a68'
                        : '#10b981',

                downColor:
                    isLight
                        ? '#d63b55'
                        : '#f43f5e',

                borderUpColor:
                    isLight
                        ? '#0f8a68'
                        : '#10b981',

                borderDownColor:
                    isLight
                        ? '#d63b55'
                        : '#f43f5e',

                wickUpColor:
                    isLight
                        ? '#0f8a68'
                        : '#10b981',

                wickDownColor:
                    isLight
                        ? '#d63b55'
                        : '#f43f5e'
            });
        }

        if (barSeries) {
            barSeries.applyOptions({

                upColor:
                    isLight
                        ? '#0f8a68'
                        : '#10b981',

                downColor:
                    isLight
                        ? '#d63b55'
                        : '#f43f5e'
            });
        }

        if (areaSeries) {
            areaSeries.applyOptions({

                lineColor:
                    isLight
                        ? '#315bb5'
                        : '#3b82f6',

                topColor:
                    isLight
                        ? 'rgba(49, 91, 181, 0.22)'
                        : 'rgba(59, 130, 246, 0.28)',

                bottomColor:
                    isLight
                        ? 'rgba(49, 91, 181, 0.02)'
                        : 'rgba(59, 130, 246, 0.02)'
            });
        }

        updateChartTypeControl();
    }

    function initChart() {

        const chartContainer =
            document.getElementById(
                'tv-chart'
            );

        if (
            !chartContainer ||
            typeof LightweightCharts === 'undefined'
        ) {
            return;
        }

        chartContainer.innerHTML = '';

        const initialWidth =
            chartContainer.clientWidth || 600;

        const initialHeight =
            chartContainer.clientHeight > 0
                ? chartContainer.clientHeight
                : 340;

        const isLightTheme =
            document.body.classList.contains(
                'light-theme'
            );

        const chartColors =
            isLightTheme
                ? {
                    background: '#f8f9fb',
                    text: '#475467',
                    grid: '#e4e7ec',
                    border: '#cbd1d9'
                }
                : {
                    background: '#0f172a',
                    text: '#94a3b8',
                    grid: '#1e293b',
                    border: '#334155'
                };

        chart =
            LightweightCharts.createChart(
                chartContainer,
                {
                    width: initialWidth,
                    height: initialHeight,

                    layout: {
                        background: {
                            type: 'solid',
                            color: chartColors.background
                        },

                        textColor:
                            chartColors.text,

                        fontFamily:
                            "'JetBrains Mono', monospace"
                    },

                    grid: {
                        vertLines: {
                            color: chartColors.grid
                        },

                        horzLines: {
                            color: chartColors.grid
                        }
                    },

                    crosshair: {
                        mode:
                            LightweightCharts
                                .CrosshairMode
                                .Normal
                    },

                    timeScale: {
                        borderColor:
                            chartColors.border,

                        timeVisible: true,

                        secondsVisible: false
                    },

                    rightPriceScale: {
                        borderColor:
                            chartColors.border
                    }
                }
            );

        lineSeries =
            chart.addLineSeries({
                color: '#3b82f6',
                lineWidth: 2,
                crosshairMarkerRadius: 5,
                visible:
                    currentChartType === 'line'
            });

        candlestickSeries =
            chart.addCandlestickSeries({
                upColor: '#10b981',
                downColor: '#f43f5e',
                borderUpColor: '#10b981',
                borderDownColor: '#f43f5e',
                wickUpColor: '#10b981',
                wickDownColor: '#f43f5e',
                visible:
                    currentChartType === 'candlestick'
            });

        barSeries =
            chart.addBarSeries({
                upColor: '#10b981',
                downColor: '#f43f5e',
                openVisible: true,
                thinBars: false,
                visible:
                    currentChartType === 'bar'
            });

        areaSeries =
            chart.addAreaSeries({
                lineColor: '#3b82f6',
                topColor:
                    'rgba(59, 130, 246, 0.28)',
                bottomColor:
                    'rgba(59, 130, 246, 0.02)',
                lineWidth: 2,
                visible:
                    currentChartType === 'area'
            });

        predictedSeries =
            chart.addLineSeries({
                color: '#10b981',
                lineWidth: 2,
                lineStyle:
                    LightweightCharts
                        .LineStyle
                        .Dotted,
                visible: true
            });

        applyChartSeriesTheme(
            isLightTheme
        );

        createChartTypeControl();

        applyChartType(
            currentChartType
        );

        window.addEventListener(
            'resize',
            resizeChartCanvas
        );

        if (window.ResizeObserver) {

            const ro =
                new ResizeObserver(() => {
                    resizeChartCanvas();
                });

            ro.observe(chartContainer);
        }
    }

    initChart();

    // =========================================================
    // MANUAL ASSET ROW INJECTOR
    // =========================================================

    function addStockRow(
        symbol = '',
        shares = ''
    ) {

        if (!portfolioList) return;

        const row =
            document.createElement('div');

        row.className =
            'portfolio-row flex items-center gap-2 mb-2';

        row.innerHTML = `
            <input
                type="text"
                placeholder="RELIANCE.NS"
                value="${symbol}"
                class="sym-input w-2/3 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500 uppercase"
            >

            <input
                type="number"
                placeholder="Qty"
                value="${shares}"
                class="share-input w-1/3 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-blue-500"
            >

            <button class="remove-btn text-slate-500 hover:text-red-400 text-xs px-1">
                ✖
            </button>
        `;

        row.querySelector(
            '.remove-btn'
        ).addEventListener(
            'click',
            () => row.remove()
        );

        portfolioList.appendChild(row);
    }

    if (addBtn) {

        addBtn.addEventListener(
            'click',
            () => {
                addStockRow('', '1');
            }
        );
    }

    // Populate default initial manual rows
    if (portfolioList) {
        portfolioList.innerHTML = '';
    }

    addStockRow(
        'RELIANCE.NS',
        '10'
    );

    addStockRow(
        'TCS.NS',
        '5'
    );

    // =========================================================
    // NAVIGATION & WORKSPACE CONTROLS
    // =========================================================

    if (btnShowChart && btnShowTable) {

        btnShowChart.addEventListener(
            'click',
            () => {

                btnShowChart.classList.add(
                    'bg-slate-800',
                    'text-white',
                    'border',
                    'border-slate-700'
                );

                btnShowChart.classList.remove(
                    'text-slate-400'
                );

                btnShowTable.classList.remove(
                    'bg-slate-800',
                    'text-white',
                    'border',
                    'border-slate-700'
                );

                btnShowTable.classList.add(
                    'text-slate-400'
                );

                if (chartSection) {
                    chartSection.classList.remove(
                        'hidden'
                    );
                }

                if (resultsSection) {
                    resultsSection.classList.add(
                        'hidden'
                    );
                }

                requestAnimationFrame(() => {
                    resizeChartCanvas();
                });
            }
        );

        btnShowTable.addEventListener(
            'click',
            () => {

                btnShowTable.classList.add(
                    'bg-slate-800',
                    'text-white',
                    'border',
                    'border-slate-700'
                );

                btnShowTable.classList.remove(
                    'text-slate-400'
                );

                btnShowChart.classList.remove(
                    'bg-slate-800',
                    'text-white',
                    'border',
                    'border-slate-700'
                );

                btnShowChart.classList.add(
                    'text-slate-400'
                );

                if (resultsSection) {
                    resultsSection.classList.remove(
                        'hidden'
                    );
                }

                if (chartSection) {
                    chartSection.classList.add(
                        'hidden'
                    );
                }
            }
        );
    }

    // =========================================================
    // RESET WORKSPACE
    // =========================================================

    if (resetLayoutBtn) {

        resetLayoutBtn.addEventListener(
            'click',
            () => {

                if (portfolioList) {
                    portfolioList.innerHTML = '';
                }

                addStockRow(
                    'RELIANCE.NS',
                    '10'
                );

                addStockRow(
                    'TCS.NS',
                    '5'
                );

                if (weightSlider) {
                    weightSlider.value = 0;
                }

                if (sliderValue) {
                    sliderValue.innerText =
                        '0% Shift';
                }

                resetScenarioDisplay();
            }
        );
    }

    // =========================================================
    // SCENARIO MODAL
    // =========================================================

    function openScenarioModal() {

        if (!scenarioModal) return;

        scenarioModal.classList.remove(
            'hidden'
        );

        scenarioModal.setAttribute(
            'aria-hidden',
            'false'
        );

        document.body.classList.add(
            'scenario-modal-open'
        );

        updateScenarioBaseValues();

        requestAnimationFrame(() => {

            if (closeScenarioBtn) {
                closeScenarioBtn.focus();
            }
        });
    }

    function closeScenarioModal() {

        if (!scenarioModal) return;

        scenarioModal.classList.add(
            'hidden'
        );

        scenarioModal.setAttribute(
            'aria-hidden',
            'true'
        );

        document.body.classList.remove(
            'scenario-modal-open'
        );
    }

    function updateScenarioBaseValues() {

        if (!lastSummaryData) {

            if (scenarioCurrentNav) {
                scenarioCurrentNav.innerText =
                    '₹0.00';
            }

            if (scenarioBaseNav) {
                scenarioBaseNav.innerText =
                    '₹0.00';
            }

            if (scenarioResultNav) {
                scenarioResultNav.innerText =
                    '₹0.00';
            }

            if (scenarioImpact) {
                scenarioImpact.innerText =
                    '₹0.00';
            }

            if (scenarioReturn) {
                scenarioReturn.innerText =
                    '0.00%';
            }

            if (scenarioStatus) {
                scenarioStatus.innerText =
                    "Execute the portfolio forecast engine first, then use this module to test hypothetical NAV scenarios.";
            }

            return;
        }

        const currentNav =
            Number(
                lastSummaryData.total_current_nav
            ) || 0;

        const basePredicted =
            Number(
                lastSummaryData.total_projected_nav
            ) || 0;

        if (scenarioCurrentNav) {

            scenarioCurrentNav.innerText =
                formatINR(currentNav);
        }

        if (scenarioBaseNav) {

            scenarioBaseNav.innerText =
                formatINR(basePredicted);
        }

        if (scenarioStatus) {

            scenarioStatus.innerText =
                "Scenario calculations are hypothetical. They do not modify the portfolio data or the ML engine's actual forecast.";
        }
    }

    function resetScenarioDisplay() {

        if (scenarioCurrentNav) {
            scenarioCurrentNav.innerText =
                '₹0.00';
        }

        if (scenarioBaseNav) {
            scenarioBaseNav.innerText =
                '₹0.00';
        }

        if (scenarioResultNav) {
            scenarioResultNav.innerText =
                '₹0.00';
        }

        if (scenarioImpact) {
            scenarioImpact.innerText =
                '₹0.00';
        }

        if (scenarioReturn) {

            scenarioReturn.innerText =
                '0.00%';

            scenarioReturn.className =
                'text-2xl sm:text-3xl font-bold font-mono text-slate-100';
        }

        if (scenarioStatus) {

            scenarioStatus.innerText =
                "Execute the portfolio forecast engine first, then use this module to test hypothetical NAV scenarios.";
        }
    }

    if (openScenarioBtn) {

        openScenarioBtn.addEventListener(
            'click',
            openScenarioModal
        );
    }

    if (closeScenarioBtn) {

        closeScenarioBtn.addEventListener(
            'click',
            closeScenarioModal
        );
    }

    // Close when clicking the darkened area outside the modal
    if (scenarioModal) {

        scenarioModal.addEventListener(
            'click',
            (event) => {

                if (
                    event.target ===
                    scenarioModal
                ) {
                    closeScenarioModal();
                }
            }
        );
    }

    // Close with Escape key
    document.addEventListener(
        'keydown',
        (event) => {

            if (
                event.key === 'Escape' &&
                scenarioModal &&
                !scenarioModal.classList.contains(
                    'hidden'
                )
            ) {
                closeScenarioModal();
            }
        }
    );

    // =========================================================
    // SCENARIO SLIDER
    // =========================================================

    if (weightSlider) {

        weightSlider.addEventListener(
            'input',
            (e) => {

                const shiftVal =
                    parseInt(
                        e.target.value,
                        10
                    );

                if (sliderValue) {

                    sliderValue.innerText =
                        `${shiftVal > 0 ? '+' : ''}${shiftVal}% Shift`;
                }
            }
        );
    }

    // =========================================================
    // SCENARIO CALCULATION
    // =========================================================

    if (simulateBtn) {

        simulateBtn.addEventListener(
            'click',
            () => {

                if (
                    !lastSummaryData ||
                    Number(
                        lastSummaryData.total_current_nav
                    ) === 0
                ) {

                    if (scenarioStatus) {

                        scenarioStatus.innerText =
                            "No active portfolio forecast is available. Execute the T+1 Forecast Engine first.";
                    }

                    return;
                }

                const shiftPercent =
                    parseFloat(
                        weightSlider
                            ? weightSlider.value
                            : 0
                    ) / 100;

                const baseCurrent =
                    Number(
                        lastSummaryData.total_current_nav
                    ) || 0;

                const basePredicted =
                    Number(
                        lastSummaryData.total_projected_nav
                    ) || 0;

                // Preserve the exact existing scenario calculation logic.
                const simulatedPredicted =
                    basePredicted *
                    (1 + shiftPercent);

                const simulatedPctChange =
                    baseCurrent > 0
                        ? (
                            (
                                simulatedPredicted -
                                baseCurrent
                            ) /
                            baseCurrent
                        ) * 100
                        : 0;

                const scenarioDelta =
                    simulatedPredicted -
                    basePredicted;

                // Update ONLY the scenario modal.
                // The main ML engine cards remain untouched.
                if (scenarioCurrentNav) {

                    scenarioCurrentNav.innerText =
                        formatINR(baseCurrent);
                }

                if (scenarioBaseNav) {

                    scenarioBaseNav.innerText =
                        formatINR(basePredicted);
                }

                if (scenarioResultNav) {

                    scenarioResultNav.innerText =
                        formatINR(
                            simulatedPredicted
                        );
                }

                if (scenarioImpact) {

                    scenarioImpact.innerText =
                        `${scenarioDelta >= 0 ? '+' : ''}${formatINR(scenarioDelta)}`;

                    scenarioImpact.className =
                        `text-lg font-bold font-mono mt-2 ${
                            scenarioDelta >= 0
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                        }`;
                }

                if (scenarioReturn) {

                    scenarioReturn.innerText =
                        `${simulatedPctChange >= 0 ? '+' : ''}${simulatedPctChange.toFixed(2)}%`;

                    scenarioReturn.className =
                        `text-2xl sm:text-3xl font-bold font-mono ${
                            simulatedPctChange >= 0
                                ? 'text-emerald-400'
                                : 'text-rose-400'
                        }`;
                }

                if (scenarioStatus) {

                    const shiftDisplay =
                        `${shiftPercent >= 0 ? '+' : ''}${(
                            shiftPercent * 100
                        ).toFixed(0)}%`;

                    scenarioStatus.innerText =
                        `Scenario applied at ${shiftDisplay}. ` +
                        `The hypothetical NAV is ${formatINR(simulatedPredicted)}. ` +
                        `Your actual ML forecast remains unchanged.`;
                }
            }
        );
    }

    // =========================================================
    // CORE EXECUTION: MANUAL PORTFOLIO ENGINE
    // =========================================================

    async function runManualEngine() {

        const manualInputs =
            getManualInputs();

        const lookbackDays =
            parseInt(
                lookbackDaysSelect
                    ? lookbackDaysSelect.value
                    : 90,
                10
            );

        const modelType =
            modelTypeSelect
                ? modelTypeSelect.value
                : 'linear';

        if (
            !manualInputs ||
            manualInputs.length === 0
        ) {

            alert(
                "No tickers found. Please type a ticker symbol into the input field (e.g. RELIANCE.NS)."
            );

            return;
        }

        if (btnText) {

            btnText.innerText =
                "Running Manual Portfolio Engine...";
        }

        if (btnSpinner) {
            btnSpinner.classList.remove(
                'hidden'
            );
        }

        if (manualAnalyzeBtn) {
            manualAnalyzeBtn.disabled = true;
        }

        if (analyzeBtn) {
            analyzeBtn.disabled = true;
        }

        const payload = {
            holdings: manualInputs,
            model_type: modelType,
            lookback_days: lookbackDays
        };

        try {

            const response =
                await fetch(
                    `${API_BASE_URL}/api/v1/predict-stock`,
                    {
                        method: 'POST',

                        headers: {
                            'Content-Type':
                                'application/json'
                        },

                        body:
                            JSON.stringify(payload)
                    }
                );

            const resJson =
                await response.json();

            if (!response.ok) {

                throw new Error(
                    resJson.detail ||
                    `HTTP ${response.status}`
                );
            }

            const analyticsData =
                resJson.data;

            if (
                !analyticsData ||
                !analyticsData.holdings
            ) {

                alert(
                    "Analysis returned an empty or invalid payload."
                );

                return;
            }

            globalPortfolioData =
                analyticsData.holdings;

            lastSummaryData =
                analyticsData.summary;

            displayResults(
                analyticsData
            );

            const firstValid =
                globalPortfolioData.find(
                    item => !item.error
                );

            if (firstValid) {
                renderChart(
                    firstValid
                );
            }

            // Keep scenario modal synced with newest engine result
            updateScenarioBaseValues();

        } catch (err) {

            alert(
                `Manual Prediction Failure: ${err.message}`
            );

        } finally {

            if (btnText) {

                btnText.innerText =
                    "Execute T+1 Forecast Engine";
            }

            if (btnSpinner) {

                btnSpinner.classList.add(
                    'hidden'
                );
            }

            if (manualAnalyzeBtn) {
                manualAnalyzeBtn.disabled = false;
            }

            if (analyzeBtn) {
                analyzeBtn.disabled = false;
            }
        }
    }

    if (manualAnalyzeBtn) {

        manualAnalyzeBtn.addEventListener(
            'click',
            runManualEngine
        );
    }

    // =========================================================
    // CORE EXECUTION: UPSTOX OAUTH ENGINE
    // =========================================================

    if (analyzeBtn) {

        analyzeBtn.addEventListener(
            'click',
            async () => {

                const token =
                    upstoxTokenInput
                        ? upstoxTokenInput.value.trim()
                        : '';

                const lookbackDays =
                    parseInt(
                        lookbackDaysSelect
                            ? lookbackDaysSelect.value
                            : 90,
                        10
                    );

                // Fallback to manual execution if no token
                if (!token) {

                    await runManualEngine();

                    return;
                }

                const payload = {

                    broker: 'upstox',

                    access_token: token,

                    model_type:
                        modelTypeSelect
                            ? modelTypeSelect.value
                            : 'linear',

                    lookback_days:
                        lookbackDays
                };

                if (btnText) {

                    btnText.innerText =
                        "Syncing Upstox & Executing Analytics...";
                }

                if (btnSpinner) {

                    btnSpinner.classList.remove(
                        'hidden'
                    );
                }

                analyzeBtn.disabled = true;

                try {

                    const response =
                        await fetch(
                            `${API_BASE_URL}/api/v1/sync-and-analyze`,
                            {
                                method: 'POST',

                                headers: {
                                    'Content-Type':
                                        'application/json'
                                },

                                body:
                                    JSON.stringify(
                                        payload
                                    )
                            }
                        );

                    if (!response.ok) {

                        const errData =
                            await response
                                .json()
                                .catch(
                                    () => ({})
                                );

                        throw new Error(
                            errData.detail ||
                            `Server returned status ${response.status}`
                        );
                    }

                    const resData =
                        await response.json();

                    const analyticsData =
                        resData.data;

                    if (
                        !analyticsData ||
                        !analyticsData.holdings
                    ) {

                        alert(
                            "No holdings found or analysis returned empty payload."
                        );

                        return;
                    }

                    globalPortfolioData =
                        analyticsData.holdings;

                    lastSummaryData =
                        analyticsData.summary;

                    displayResults(
                        analyticsData
                    );

                    const firstValid =
                        globalPortfolioData.find(
                            item => !item.error
                        );

                    if (firstValid) {

                        renderChart(
                            firstValid
                        );
                    }

                    // Keep scenario modal synced with newest engine result
                    updateScenarioBaseValues();

                } catch (error) {

                    alert(
                        `Analysis Failure: ${error.message}`
                    );

                } finally {

                    if (btnText) {

                        btnText.innerText =
                            "Execute T+1 Forecast Engine";
                    }

                    if (btnSpinner) {

                        btnSpinner.classList.add(
                            'hidden'
                        );
                    }

                    analyzeBtn.disabled = false;
                }
            }
        );
    }

    // =========================================================
    // RENDER METRIC CARDS & POSITIONS TABLE
    // =========================================================

    function displayResults(
        analyticsData
    ) {

        const summary =
            analyticsData.summary || {};

        const totCurrentEl =
            document.getElementById(
                'tot-current'
            );

        const totPredictedEl =
            document.getElementById(
                'tot-predicted'
            );

        if (totCurrentEl) {

            totCurrentEl.innerText =
                formatINR(
                    summary.total_current_nav ||
                    0
                );
        }

        if (totPredictedEl) {

            totPredictedEl.innerText =
                formatINR(
                    summary.total_projected_nav ||
                    0
                );
        }

        const pctEl =
            document.getElementById(
                'tot-change'
            );

        if (pctEl) {

            const pctVal =
                summary.portfolio_alpha_pct ||
                0;

            pctEl.innerText =
                `${pctVal >= 0 ? '+' : ''}${pctVal.toFixed(2)}%`;

            pctEl.className =
                `text-xl font-bold font-mono mt-1 ${
                    pctVal >= 0
                        ? 'text-emerald-400'
                        : 'text-rose-400'
                }`;
        }

        const avgConfidenceEl =
            document.getElementById(
                'avg-confidence'
            );

        if (avgConfidenceEl) {

            const r2Val =
                (
                    summary.average_r2_confidence ||
                    0
                ) * 100;

            avgConfidenceEl.innerText =
                `${r2Val.toFixed(1)}%`;
        }

        const tbody =
            document.getElementById(
                'results-body'
            );

        if (!tbody) return;

        tbody.innerHTML = '';

        const holdings =
            analyticsData.holdings || [];

        holdings.forEach(item => {

            const tr =
                document.createElement(
                    'tr'
                );

            tr.className =
                "hover:bg-slate-800/50 cursor-pointer transition";

            if (item.error) {

                tr.innerHTML =
                    `<td colspan="6" class="py-3 text-rose-400 font-sans">${item.symbol}: ${item.error}</td>`;

            } else {

                const changePct =
                    item.expected_change_pct ||
                    0;

                const isPositive =
                    changePct >= 0;

                tr.innerHTML = `
                    <td class="py-3 font-bold text-slate-100">
                        ${item.symbol}
                    </td>

                    <td class="py-3">
                        ${item.quantity}
                    </td>

                    <td class="py-3">
                        ${formatINR(item.current_price)}
                    </td>

                    <td class="py-3 text-blue-400 font-semibold">
                        ${formatINR(item.target_price_t1)}
                    </td>

                    <td class="py-3 font-semibold ${
                        isPositive
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                    }">
                        ${isPositive ? '+' : ''}
                        ${changePct.toFixed(2)}%
                    </td>

                    <td class="py-3">
                        <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                            ${(
                                (
                                    item.model_r2_score ||
                                    0
                                ) * 100
                            ).toFixed(1)}%
                        </span>
                    </td>
                `;

                tr.addEventListener(
                    'click',
                    () => {

                        renderChart(
                            item
                        );

                        if (btnShowChart) {
                            btnShowChart.click();
                        }
                    }
                );
            }

            tbody.appendChild(tr);
        });
    }

    // =========================================================
    // RENDER STOCK PRICE TRAJECTORY CHART
    // =========================================================

    function renderChart(
        itemData
    ) {

        const chartTitle =
            document.getElementById(
                'chart-title'
            );

        const chartAccuracy =
            document.getElementById(
                'chart-accuracy'
            );

        if (chartTitle) {

            chartTitle.innerText =
                `${itemData.symbol} Target Trajectory`;
        }

        if (chartAccuracy) {

            chartAccuracy.innerText =
                `R² Confidence: ${(
                    (
                        itemData.model_r2_score ||
                        0
                    ) * 100
                ).toFixed(1)}%`;
        }

        if (
            !itemData ||
            !chart ||
            !lineSeries ||
            !predictedSeries
        ) {
            return;
        }

        // ---------------------------------------------------------
        // Historical close data
        // ---------------------------------------------------------
        const history =
            Array.isArray(itemData.history)
                ? itemData.history
                : [];

        if (history.length === 0) {
            return;
        }

        // ---------------------------------------------------------
        // OHLC data for Candlestick / Bar charts
        // ---------------------------------------------------------
        let ohlcHistory =
            Array.isArray(
                itemData.ohlc_history
            )
                ? itemData.ohlc_history
                : [];

        /*
         * Backward-compatible fallback.
         *
         * The deployed backend now supplies real OHLC data.
         * If an older response is ever loaded, the chart can
         * still render by creating flat OHLC candles from Close.
         */
        if (
            ohlcHistory.length === 0 &&
            history.length > 0
        ) {

            ohlcHistory =
                history.map(point => ({
                    time: point.time,
                    open: point.value,
                    high: point.value,
                    low: point.value,
                    close: point.value
                }));
        }

        // ---------------------------------------------------------
        // Feed historical data into every chart series.
        // Only the selected series is visible.
        // ---------------------------------------------------------
        lineSeries.setData(
            history
        );

        if (areaSeries) {
            areaSeries.setData(
                history
            );
        }

        if (
            candlestickSeries &&
            ohlcHistory.length > 0
        ) {
            candlestickSeries.setData(
                ohlcHistory
            );
        }

        if (
            barSeries &&
            ohlcHistory.length > 0
        ) {
            barSeries.setData(
                ohlcHistory
            );
        }

        // ---------------------------------------------------------
        // T+1 forecast overlay
        // ---------------------------------------------------------
        const lastHistorical =
            history[
                history.length - 1
            ];

        const predictionDate =
            itemData.prediction_date;

        if (
            lastHistorical &&
            predictionDate &&
            itemData.target_price_t1 !== undefined &&
            itemData.target_price_t1 !== null
        ) {

            predictedSeries.setData([
                {
                    time:
                        lastHistorical.time,

                    value:
                        Number(
                            lastHistorical.value
                        )
                },

                {
                    time:
                        predictionDate,

                    value:
                        Number(
                            itemData.target_price_t1
                        )
                }
            ]);

        } else {

            predictedSeries.setData([]);
        }

        // ---------------------------------------------------------
        // Forecast direction color
        // ---------------------------------------------------------
        const isLight =
            document.body.classList.contains(
                'light-theme'
            );

        const trendColor =
            Number(
                itemData.target_price_t1
            ) >= Number(
                lastHistorical.value
            )
                ? (
                    isLight
                        ? '#0f8a68'
                        : '#10b981'
                )
                : (
                    isLight
                        ? '#d63b55'
                        : '#f43f5e'
                );

        predictedSeries.applyOptions({
            color: trendColor,
            lineWidth: 2,
            lineStyle:
                LightweightCharts
                    .LineStyle
                    .Dotted,
            visible: true
        });

        // Keep the user's selected chart type after
        // switching to another stock.
        applyChartType(
            currentChartType
        );

        requestAnimationFrame(() => {
            resizeChartCanvas();
        });
    }

});