// ==========================================================================
// PanCafe Pro Inventory - Reports, Shift Security & Cashier Audit
// ==========================================================================

class ReportsManager {
    constructor() {
        this.currentReportTab = 'active-shift';
    }

    openDailyReportModal() {
        this.render();
        window.app.openModal('report-modal');
    }

    setReportTab(tab) {
        this.currentReportTab = tab;
        document.querySelectorAll('.report-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        this.render();
    }

    render() {
        const isAdmin = window.auth.isAdmin();
        const activeShift = window.db.getActiveShift();
        const currentUser = window.auth.currentUser;
        const settings = window.db.getSettings();
        const currency = settings.currency || 'ج.م';

        const adminSection = document.getElementById('report-admin-section');
        const cashierSection = document.getElementById('report-cashier-section');
        const historySection = document.getElementById('report-history-section');
        const cashierLookupSection = document.getElementById('report-cashier-lookup-section');

        // Hide all first
        [adminSection, cashierSection, historySection, cashierLookupSection].forEach(el => {
            if (el) el.style.display = 'none';
        });

        if (this.currentReportTab === 'history') {
            if (historySection) historySection.style.display = 'block';
            this.renderShiftsHistory(currency);
            return;
        }

        if (this.currentReportTab === 'cashier-lookup') {
            if (cashierLookupSection) cashierLookupSection.style.display = 'block';
            this.populateCashierLookupDropdowns();
            return;
        }

        // Select sales based on tab
        let salesList = [];
        if (this.currentReportTab === 'active-shift') {
            salesList = window.db.getSalesForActiveShift();
        } else if (this.currentReportTab === 'all-today') {
            const today = getTodayDateString();
            salesList = window.db.getSales().filter(s => s.date === today);
        }

        if (isAdmin) {
            if (adminSection) adminSection.style.display = 'block';
            this.renderAdminReport(salesList, activeShift, currency);
        } else {
            if (cashierSection) cashierSection.style.display = 'block';
            const mySales = salesList.filter(s => s.cashierId === currentUser.id);
            this.renderCashierReport(mySales, activeShift, currentUser, currency);
        }
    }

    // =====================================================================
    // Cashier Lookup by Name - Admin Feature
    // =====================================================================

    populateCashierLookupDropdowns() {
        const cashierSelect = document.getElementById('cashier-lookup-select');
        if (!cashierSelect) return;

        const users = window.db.getUsers();
        const currentOptions = cashierSelect.innerHTML;

        cashierSelect.innerHTML = '<option value="">-- اختر الكاشير --</option>';
        users.forEach(u => {
            cashierSelect.innerHTML += `<option value="${u.id}">${u.fullName} (${u.role === 'admin' ? 'مدير' : 'كاشير'})</option>`;
        });
    }

    onCashierLookupChange() {
        const cashierSelect = document.getElementById('cashier-lookup-select');
        const shiftSelect = document.getElementById('cashier-shift-select');
        if (!cashierSelect || !shiftSelect) return;

        const cashierId = cashierSelect.value;
        if (!cashierId) {
            shiftSelect.innerHTML = '<option value="active">الوردية الحالية النشطة</option>';
            return;
        }

        const allSales = window.db.getSales().filter(s => s.cashierId === cashierId);
        const shifts = window.db.getShiftsHistory();

        shiftSelect.innerHTML = '<option value="active">الوردية الحالية النشطة</option>';

        // Add closed shifts that had sales by this cashier
        shifts.forEach(sh => {
            const shiftSales = allSales.filter(s => s.shiftId === sh.id);
            if (shiftSales.length > 0) {
                shiftSelect.innerHTML += `<option value="${sh.id}">وردية #${sh.shiftNumber} - ${sh.startDate} (${sh.startTimeFormatted} إلى ${sh.endTimeFormatted || '?'})</option>`;
            }
        });
    }

    onCashierShiftChange() {
        // Just pre-select, results shown on button click
    }

    renderCashierLookup() {
        const cashierSelect = document.getElementById('cashier-lookup-select');
        const shiftSelect = document.getElementById('cashier-shift-select');
        const resultsDiv = document.getElementById('cashier-lookup-results');

        if (!cashierSelect || !cashierSelect.value) {
            if (resultsDiv) resultsDiv.innerHTML = `<div style="text-align:center;color:var(--status-orange);padding:20px;">⚠️ اختر اسم الكاشير أولاً</div>`;
            return;
        }

        const cashierId = cashierSelect.value;
        const cashierName = cashierSelect.options[cashierSelect.selectedIndex].text;
        const selectedShift = shiftSelect ? shiftSelect.value : 'active';
        const settings = window.db.getSettings();
        const currency = settings.currency || 'ج.م';

        let salesList = [];

        if (selectedShift === 'active') {
            const activeShift = window.db.getActiveShift();
            salesList = window.db.getSalesForActiveShift().filter(s => s.cashierId === cashierId);
        } else {
            salesList = window.db.getSales().filter(s => s.cashierId === cashierId && s.shiftId === selectedShift);
        }

        const totalCash = salesList.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
        const totalCost = salesList.reduce((sum, s) =>
            sum + s.items.reduce((a, it) => a + ((parseFloat(it.buyPrice) || 0) * (parseFloat(it.qty) || 0)), 0), 0);
        const netProfit = totalCash - totalCost;

        // Aggregate items
        const itemsMap = {};
        salesList.forEach(s => {
            s.items.forEach(it => {
                if (!itemsMap[it.name]) itemsMap[it.name] = { name: it.name, qty: 0, total: 0 };
                itemsMap[it.name].qty += parseFloat(it.qty) || 0;
                itemsMap[it.name].total += parseFloat(it.total) || 0;
            });
        });

        const shiftLabel = selectedShift === 'active' ? 'الوردية النشطة الحالية' :
            (shiftSelect ? shiftSelect.options[shiftSelect.selectedIndex].text : '');

        if (!resultsDiv) return;

        resultsDiv.innerHTML = `
            <div style="display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:10px; margin-bottom:12px;">
                <div style="background:var(--bg-dark-panel); border:1px solid var(--border-color); padding:12px; border-radius:8px; text-align:center;">
                    <div style="font-size:11px; color:var(--text-secondary);">الكاشير</div>
                    <div style="font-weight:bold; color:#fff; margin-top:4px;">${cashierName}</div>
                </div>
                <div style="background:var(--bg-dark-panel); border:1px solid var(--border-color); padding:12px; border-radius:8px; text-align:center;">
                    <div style="font-size:11px; color:var(--text-secondary);">عدد الفواتير</div>
                    <div style="font-size:20px; font-weight:bold; color:var(--primary-cyan); font-family:var(--font-mono); margin-top:4px;">${salesList.length}</div>
                </div>
                <div style="background:var(--bg-dark-panel); border:1px solid var(--border-color); padding:12px; border-radius:8px; text-align:center;">
                    <div style="font-size:11px; color:var(--text-secondary);">فلوس الدرج (مبيعات)</div>
                    <div style="font-size:20px; font-weight:bold; color:var(--status-green); font-family:var(--font-mono); margin-top:4px;">${totalCash.toFixed(2)} ${currency}</div>
                </div>
                <div style="background:rgba(0,230,118,0.08); border:1px solid var(--status-green); padding:12px; border-radius:8px; text-align:center;">
                    <div style="font-size:11px; color:var(--text-secondary);">صافي الربح الفعلي</div>
                    <div style="font-size:20px; font-weight:bold; color:var(--status-green); font-family:var(--font-mono); margin-top:4px;">+${netProfit.toFixed(2)} ${currency}</div>
                </div>
            </div>

            <div style="font-weight:bold; font-size:13px; margin-bottom:6px; color:var(--text-highlight);">
                <i class="fas fa-list-check"></i> الأصناف التي باعها ${cashierName} في ${shiftLabel}:
            </div>
            <div style="max-height:200px; overflow-y:auto; border:1px solid var(--border-color); border-radius:6px;">
                <table class="pancafe-table">
                    <thead>
                        <tr>
                            <th>اسم الصنف</th>
                            <th>الكمية المباعة</th>
                            <th>إجمالي المبلغ المحصل</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${Object.values(itemsMap).length === 0
                ? `<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:20px;">لم يبع هذا الكاشير أي شيء في هذه الفترة</td></tr>`
                : Object.values(itemsMap).map(item => `
                                <tr>
                                    <td><strong>${item.name}</strong></td>
                                    <td><span class="badge badge-warning">${item.qty} قطعة</span></td>
                                    <td><strong style="color:var(--status-green);font-family:var(--font-mono);">${item.total.toFixed(2)} ${currency}</strong></td>
                                </tr>
                            `).join('')
            }
                    </tbody>
                </table>
            </div>
        `;
    }

    // =====================================================================
    // Cashier Own View - LOCKED to only their own data
    // =====================================================================

    renderCashierReport(salesList, activeShift, currentUser, currency) {
        const totalSalesCash = salesList.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
        const totalInvoicesCount = salesList.length;

        let totalItemsSold = 0;
        salesList.forEach(s => {
            s.items.forEach(it => { totalItemsSold += (parseFloat(it.qty) || 0); });
        });

        const cashierNameEl = document.getElementById('report-cashier-name');
        const cashierDateEl = document.getElementById('report-cashier-date');
        const shiftBadgeEl = document.getElementById('report-cashier-shift-badge');
        const cashierCashEl = document.getElementById('report-cashier-total-cash');
        const cashierCountEl = document.getElementById('report-cashier-count');
        const cashierItemsEl = document.getElementById('report-cashier-items-count');
        const tableBody = document.getElementById('report-cashier-invoices-body');

        if (cashierNameEl) cashierNameEl.textContent = currentUser.fullName;
        if (cashierDateEl) cashierDateEl.textContent = `${activeShift.startDate} (بدأت: ${activeShift.startTimeFormatted || ''})`;
        if (shiftBadgeEl) shiftBadgeEl.textContent = `وردية #${activeShift.shiftNumber}`;
        if (cashierCashEl) cashierCashEl.textContent = `${totalSalesCash.toFixed(2)} ${currency}`;
        if (cashierCountEl) cashierCountEl.textContent = totalInvoicesCount;
        if (cashierItemsEl) cashierItemsEl.textContent = totalItemsSold;

        if (tableBody) {
            if (salesList.length === 0) {
                tableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-muted); padding: 24px;">لا توجد مبيعات في هذه الوردية حتى الآن</td></tr>`;
            } else {
                tableBody.innerHTML = salesList.map(s => {
                    const isTransfer = s.paymentMethod === 'transfer';
                    return `
                    <tr>
                        <td>
                            <strong>${s.id}</strong>
                            <div style="font-size:10px; color:var(--text-muted);">${s.customer || 'عميل نقدي'}</div>
                        </td>
                        <td>
                            <div>${s.time}</div>
                            <span class="badge ${isTransfer ? 'badge-info' : 'badge-success'}" style="font-size:10px; padding:2px 5px; margin-top:2px;">
                                ${isTransfer ? `📱 تحويل (${s.transferPhone || '-'})` : '💵 كاش'}
                            </span>
                        </td>
                        <td>
                            <div>${s.items.map(it => `${it.name} (${it.qty})`).join(', ')}</div>
                            ${s.discount > 0 ? `<div style="font-size:10px; color:#ff7675;">خصم: -${parseFloat(s.discount).toFixed(2)} ${s.discountReason ? `(${s.discountReason})` : ''}</div>` : ''}
                        </td>
                        <td>
                            <strong style="color:var(--status-green); font-family:var(--font-mono);">${parseFloat(s.total).toFixed(2)} ${currency}</strong>
                        </td>
                    </tr>
                `;
                }).join('');
            }
        }
    }

    // =====================================================================
    // Admin Full Report - Revenue, Cost, and per-item Net Profit
    // =====================================================================

    renderAdminReport(salesList, activeShift, currency) {
        const totalRevenue = salesList.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);

        let totalCost = 0;
        let itemsMap = {};

        salesList.forEach(s => {
            s.items.forEach(it => {
                const buyCost = parseFloat(it.buyPrice) || 0;
                const sellPrice = parseFloat(it.price) || 0;
                const qty = parseFloat(it.qty) || 0;
                totalCost += buyCost * qty;

                if (!itemsMap[it.name]) {
                    itemsMap[it.name] = { name: it.name, qty: 0, buyPrice: buyCost, sellPrice: sellPrice, totalCost: 0, totalRevenue: 0, totalProfit: 0 };
                }
                itemsMap[it.name].qty += qty;
                itemsMap[it.name].totalCost += buyCost * qty;
                itemsMap[it.name].totalRevenue += sellPrice * qty;
                itemsMap[it.name].totalProfit += (sellPrice - buyCost) * qty;
            });
        });

        const netProfit = totalRevenue - totalCost;

        const revEl = document.getElementById('report-admin-revenue');
        const costEl = document.getElementById('report-admin-cost');
        const profitEl = document.getElementById('report-admin-profit');
        const invCountEl = document.getElementById('report-admin-invoices-count');
        const shiftBadgeEl = document.getElementById('report-admin-shift-badge');

        if (revEl) revEl.textContent = `${totalRevenue.toFixed(2)} ${currency}`;
        if (costEl) costEl.textContent = `${totalCost.toFixed(2)} ${currency}`;
        if (profitEl) {
            profitEl.textContent = `${netProfit >= 0 ? '+' : ''}${netProfit.toFixed(2)} ${currency}`;
            profitEl.style.color = netProfit >= 0 ? 'var(--status-green)' : 'var(--status-red)';
        }
        if (invCountEl) invCountEl.textContent = salesList.length;
        if (shiftBadgeEl) shiftBadgeEl.textContent = `وردية #${activeShift.shiftNumber} (بدأت: ${activeShift.startTimeFormatted || ''})`;

        // Per-item profit breakdown table
        const profitTableBody = document.getElementById('report-admin-items-profit-body');
        if (profitTableBody) {
            const itemsList = Object.values(itemsMap);
            if (itemsList.length === 0) {
                profitTableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-muted); padding: 20px;">لا توجد مبيعات في هذه الوردية</td></tr>`;
            } else {
                profitTableBody.innerHTML = itemsList.map(item => `
                    <tr>
                        <td><strong>${item.name}</strong></td>
                        <td><span class="badge badge-warning">${item.qty}</span></td>
                        <td style="color:var(--text-secondary); font-family:var(--font-mono);">${item.buyPrice.toFixed(2)} ${currency}</td>
                        <td style="font-family:var(--font-mono);">${item.sellPrice.toFixed(2)} ${currency}</td>
                        <td><strong style="color:var(--primary-cyan); font-family:var(--font-mono);">+${(item.sellPrice - item.buyPrice).toFixed(2)} ${currency}</strong></td>
                        <td style="color:#ff9100; font-family:var(--font-mono);">${item.totalCost.toFixed(2)} ${currency}</td>
                        <td style="font-family:var(--font-mono);">${item.totalRevenue.toFixed(2)} ${currency}</td>
                        <td><strong style="color:var(--status-green); font-family:var(--font-mono);">+${item.totalProfit.toFixed(2)} ${currency}</strong></td>
                    </tr>
                `).join('');
            }
        }

        // Invoices log
        const invoicesBody = document.getElementById('report-admin-invoices-body');
        if (invoicesBody) {
            if (salesList.length === 0) {
                invoicesBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding: 20px;">لا توجد فواتير مسجلة</td></tr>`;
            } else {
                invoicesBody.innerHTML = salesList.map(s => {
                    const invCost = s.items.reduce((sum, it) => sum + ((parseFloat(it.buyPrice) || 0) * (parseFloat(it.qty) || 0)), 0);
                    const invProfit = (parseFloat(s.total) || 0) - invCost;
                    return `
                        <tr>
                            <td><strong>${s.id}</strong></td>
                            <td>${s.time}</td>
                            <td><span class="badge badge-success">${s.cashierName}</span></td>
                            <td>${s.customer}</td>
                            <td><strong>${(parseFloat(s.total) || 0).toFixed(2)} ${currency}</strong></td>
                            <td style="color:${invProfit >= 0 ? 'var(--status-green)' : 'var(--status-red)'}; font-weight:bold;">+${invProfit.toFixed(2)} ${currency}</td>
                        </tr>
                    `;
                }).join('');
            }
        }

        // Top items
        const topItemsContainer = document.getElementById('report-admin-top-items');
        if (topItemsContainer) {
            const sorted = Object.values(itemsMap).sort((a, b) => b.qty - a.qty).slice(0, 5);
            if (sorted.length === 0) {
                topItemsContainer.innerHTML = `<div style="color:var(--text-muted); font-size:12px; text-align:center; padding:20px;">لا توجد مبيعات</div>`;
            } else {
                topItemsContainer.innerHTML = sorted.map((item, idx) => `
                    <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid var(--border-color); font-size:13px;">
                        <div>
                            <span style="color:var(--primary-cyan); font-weight:bold;">#${idx + 1}</span>
                            <strong style="margin-right:6px;">${item.name}</strong>
                        </div>
                        <div>
                            <span class="badge badge-warning">${item.qty} مباعة</span>
                            <span style="font-family:var(--font-mono); color:var(--status-green); margin-right:8px;">${item.totalRevenue.toFixed(2)} ${currency}</span>
                        </div>
                    </div>
                `).join('');
            }
        }
    }

    // =====================================================================
    // =====================================================================
    // Upgraded Secure Shift Close & Shift History Console
    // =====================================================================

    openSecureCloseShiftModal() {
        try {
            const activeShift = window.db.getActiveShift();
            const sales = window.db.getSalesForActiveShift();
            const currentUser = window.auth.currentUser || { fullName: 'المستخدم', role: 'cashier', password: '123' };
            const isAdmin = window.auth.isAdmin();
            const settings = window.db.getSettings();
            const currency = settings.currency || 'ج.م';

            // 1. Financial calculations
            const totalCash = sales.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
            const totalInvoices = sales.length;

            let totalDiscounts = 0;
            let cashSales = 0;
            let transferSales = 0;

            let totalCost = 0;
            let totalItemsQty = 0;
            const itemsMap = {};

            sales.forEach(s => {
                const sTotal = parseFloat(s.total) || 0;
                const sDisc = parseFloat(s.discount) || 0;
                totalDiscounts += sDisc;

                if (s.paymentMethod === 'transfer') {
                    transferSales += sTotal;
                } else {
                    cashSales += sTotal;
                }

                s.items.forEach(it => {
                    const buyCost = parseFloat(it.buyPrice) || 0;
                    const sellPrice = parseFloat(it.price) || 0;
                    const qty = parseFloat(it.qty) || 0;
                    const revenue = sellPrice * qty;
                    const cost = buyCost * qty;
                    const profit = revenue - cost;

                    totalCost += cost;
                    totalItemsQty += qty;

                    if (!itemsMap[it.name]) {
                        itemsMap[it.name] = {
                            name: it.name,
                            qty: 0,
                            unit: it.unit || 'قطعة',
                            buyPrice: buyCost,
                            price: sellPrice,
                            totalCost: 0,
                            total: 0,
                            profit: 0
                        };
                    }
                    itemsMap[it.name].qty += qty;
                    itemsMap[it.name].totalCost += cost;
                    itemsMap[it.name].total += revenue;
                    itemsMap[it.name].profit += profit;
                });
            });

            const netProfit = totalCash - totalCost;
            const profitMargin = totalCash > 0 ? ((netProfit / totalCash) * 100).toFixed(1) : '0';

            // Cache for filtering and auditing
            this.activeShiftData = {
                shift: activeShift,
                sales,
                totalCash,
                cashSales,
                transferSales,
                totalDiscounts,
                totalInvoices,
                totalItemsQty,
                totalCost,
                netProfit,
                profitMargin,
                items: Object.values(itemsMap),
                currency
            };
            this.activeShiftFilteredItems = [...this.activeShiftData.items];

            // 2. Populate Header & User Info
            const avatarEl = document.getElementById('shift-user-avatar');
            const cashierEl = document.getElementById('secure-close-cashier-name');
            const roleBadgeEl = document.getElementById('shift-user-role-badge');
            const shiftNumEl = document.getElementById('secure-close-shift-num');
            const startTimeEl = document.getElementById('shift-modal-start-time');
            const durationEl = document.getElementById('shift-modal-duration');
            const statusChipText = document.getElementById('shift-chip-text');

            if (avatarEl) avatarEl.textContent = currentUser.avatar || (isAdmin ? '👨‍💼' : '🧑‍💻');
            if (cashierEl) cashierEl.textContent = currentUser.fullName;
            if (roleBadgeEl) {
                roleBadgeEl.textContent = isAdmin ? 'المدير العام' : 'كاشير / صالة';
                roleBadgeEl.className = isAdmin ? 'badge badge-success' : 'badge badge-info';
            }
            if (shiftNumEl) shiftNumEl.textContent = `وردية #${activeShift ? activeShift.shiftNumber : 1}`;
            if (statusChipText) statusChipText.textContent = `وردية #${activeShift ? activeShift.shiftNumber : 1} - جارية الآن`;
            if (startTimeEl && activeShift) startTimeEl.textContent = `${activeShift.startDate || ''} (${activeShift.startTimeFormatted || ''})`;
            if (durationEl && activeShift) durationEl.textContent = this._formatShiftDuration(activeShift.startTime);

            // 3. Populate KPI Cards
            const totalCashEl = document.getElementById('secure-close-total-cash');
            const invoicesEl = document.getElementById('shift-kpi-invoices-count');
            const itemsQtyEl = document.getElementById('shift-kpi-items-qty');
            const totalCostEl = document.getElementById('shift-kpi-total-cost');
            const netProfitEl = document.getElementById('shift-kpi-net-profit');
            const profitMarginEl = document.getElementById('shift-kpi-profit-margin');
            const cashierNoticeEl = document.getElementById('shift-cashier-notice');
            const auditExpectedCashEl = document.getElementById('audit-expected-cash');
            const auditCurrencyEl = document.getElementById('audit-cash-currency');
            const discountsEl = document.getElementById('shift-kpi-total-discounts');
            const discountsSubEl = document.getElementById('shift-kpi-discounts-sub');
            const paymentsEl = document.getElementById('shift-kpi-payments-breakdown');

            if (totalCashEl) totalCashEl.textContent = `${totalCash.toFixed(2)} ${currency}`;
            if (auditExpectedCashEl) auditExpectedCashEl.textContent = `${totalCash.toFixed(2)} ${currency}`;
            if (auditCurrencyEl) auditCurrencyEl.textContent = currency;
            if (invoicesEl) invoicesEl.textContent = `${totalInvoices} عملية`;
            if (itemsQtyEl) itemsQtyEl.textContent = `${totalItemsQty} قطعة`;

            if (discountsEl) discountsEl.textContent = `${totalDiscounts.toFixed(2)} ${currency}`;
            if (discountsSubEl) {
                const discCount = sales.filter(s => (parseFloat(s.discount) || 0) > 0).length;
                discountsSubEl.textContent = discCount > 0 ? `${discCount} فواتير بها خصم` : 'لا توجد خصومات';
            }
            if (paymentsEl) {
                paymentsEl.textContent = `كاش: ${cashSales.toFixed(2)} | تحويل: ${transferSales.toFixed(2)}`;
            }

            // 4. Role Permissions: Admin vs Cashier Display
            const adminMetricCards = document.querySelectorAll('.admin-metric-el');
            const adminTableCols = document.querySelectorAll('.admin-table-col');

            if (isAdmin) {
                adminMetricCards.forEach(el => el.style.display = 'flex');
                adminTableCols.forEach(el => el.style.display = 'table-cell');
                if (cashierNoticeEl) cashierNoticeEl.style.display = 'none';

                if (totalCostEl) totalCostEl.textContent = `${totalCost.toFixed(2)} ${currency}`;
                if (netProfitEl) {
                    netProfitEl.textContent = `${netProfit >= 0 ? '+' : ''}${netProfit.toFixed(2)} ${currency}`;
                    netProfitEl.style.color = netProfit >= 0 ? '#49ffa0' : 'var(--status-red)';
                }
                if (profitMarginEl) profitMarginEl.textContent = `هامش ربح الوردية: ${profitMargin}%`;
            } else {
                adminMetricCards.forEach(el => el.style.display = 'none');
                adminTableCols.forEach(el => el.style.display = 'none');
                if (cashierNoticeEl) cashierNoticeEl.style.display = 'block';
            }

            // 5. Render Active Sold Items Table
            this.renderActiveShiftItemsTable();

            // 6. Reset Form & Cash Count Input & Reconciliation Cards
            this.currentShiftAudit = null;
            const passInput = document.getElementById('secure-close-password-input');
            const cashInput = document.getElementById('shift-actual-cash-input');
            const searchInput = document.getElementById('shift-active-items-search');
            if (passInput) passInput.value = '';
            if (cashInput) cashInput.value = '';
            if (searchInput) searchInput.value = '';
            this.onCashCountInputChange('');

            // 7. Setup Shift History Tab
            this.populateHistoryShiftPicker();

            // 8. Default to Active Shift Tab
            this.switchShiftModalTab('active-shift');
        } catch (err) {
            console.error('Error rendering shift modal data:', err);
        }

        // Always open modal
        window.app.openModal('secure-close-shift-modal');
        const cashInput = document.getElementById('shift-actual-cash-input');
        setTimeout(() => { if (cashInput && typeof cashInput.focus === 'function') cashInput.focus(); }, 200);
    }

    _formatShiftDuration(startTime) {
        if (!startTime) return 'أقل من دقيقة';
        const diffMs = Math.max(0, Date.now() - startTime);
        const totalMinutes = Math.floor(diffMs / (1000 * 60));
        const hours = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        if (hours === 0 && mins === 0) return 'أقل من دقيقة';
        if (hours === 0) return `${mins} دقيقة`;
        return `${hours} ساعة و ${mins} دقيقة`;
    }

    renderActiveShiftItemsTable() {
        const tableBody = document.getElementById('secure-close-items-table-body');
        if (!tableBody) return;

        const items = this.activeShiftFilteredItems || [];
        const isAdmin = window.auth.isAdmin();
        const currency = (this.activeShiftData && this.activeShiftData.currency) || 'ج.م';

        if (items.length === 0) {
            const colspan = isAdmin ? 7 : 4;
            tableBody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center; color:var(--text-muted); padding:24px;">لا توجد مبيعات في هذه الوردية حتى الآن</td></tr>`;
            return;
        }

        tableBody.innerHTML = items.map(item => `
            <tr>
                <td>
                    <strong style="color:#fff;">${item.name}</strong>
                    <div style="font-size:10px; color:var(--text-secondary);">${item.unit || 'قطعة'}</div>
                </td>
                <td>
                    <span class="badge badge-warning" style="font-family:var(--font-mono); font-size:12px;">${item.qty} ${item.unit || 'قطعة'}</span>
                </td>
                <td style="font-family:var(--font-mono);">${item.price.toFixed(2)} ${currency}</td>
                <td>
                    <strong style="color:var(--status-green); font-family:var(--font-mono); font-size:13px;">${item.total.toFixed(2)} ${currency}</strong>
                </td>
                ${isAdmin ? `
                    <td class="admin-table-col" style="font-family:var(--font-mono); color:#ffbb33;">${item.buyPrice.toFixed(2)} ${currency}</td>
                    <td class="admin-table-col" style="font-family:var(--font-mono); color:#ffaa00;">${item.totalCost.toFixed(2)} ${currency}</td>
                    <td class="admin-table-col" style="font-family:var(--font-mono); font-weight:bold; color:${item.profit >= 0 ? '#49ffa0' : 'var(--status-red)'};">
                        ${item.profit >= 0 ? '+' : ''}${item.profit.toFixed(2)} ${currency}
                    </td>
                ` : ''}
            </tr>
        `).join('');
    }

    filterActiveShiftItems(query) {
        const q = (query || '').toLowerCase().trim();
        if (!this.activeShiftData) return;

        if (!q) {
            this.activeShiftFilteredItems = [...this.activeShiftData.items];
        } else {
            this.activeShiftFilteredItems = this.activeShiftData.items.filter(it =>
                it.name.toLowerCase().includes(q)
            );
        }
        this.renderActiveShiftItemsTable();
    }

    onCashCountInputChange(val) {
        const totalExpected = (this.activeShiftData && this.activeShiftData.totalCash) || 0;
        const currency = (this.activeShiftData && this.activeShiftData.currency) || 'ج.م';

        const shortageCard = document.getElementById('audit-shortage-card');
        const shortageValEl = document.getElementById('audit-shortage-value');
        const shortageSubEl = document.getElementById('audit-shortage-sub');

        const surplusCard = document.getElementById('audit-surplus-card');
        const surplusValEl = document.getElementById('audit-surplus-value');
        const surplusSubEl = document.getElementById('audit-surplus-sub');

        const banner = document.getElementById('shift-audit-banner');
        const bannerIcon = document.getElementById('shift-audit-banner-icon');
        const bannerText = document.getElementById('shift-audit-banner-text');

        // Legacy badge support if exists
        const badge = document.getElementById('shift-diff-badge');

        if (val === '' || val === null || val === undefined) {
            this.currentShiftAudit = null;
            if (shortageValEl) shortageValEl.textContent = `0.00 ${currency}`;
            if (shortageSubEl) shortageSubEl.innerHTML = `<span style="color:#ff8fa3;">لا يوجد عجز</span>`;
            if (shortageCard) {
                shortageCard.style.borderColor = 'rgba(255, 61, 113, 0.35)';
                shortageCard.style.boxShadow = 'none';
                shortageCard.style.background = 'linear-gradient(145deg, #221417 0%, #1a1012 100%)';
            }

            if (surplusValEl) surplusValEl.textContent = `0.00 ${currency}`;
            if (surplusSubEl) surplusSubEl.innerHTML = `<span style="color:#80e5ff;">لا يوجد أوفر</span>`;
            if (surplusCard) {
                surplusCard.style.borderColor = 'rgba(0, 210, 255, 0.35)';
                surplusCard.style.boxShadow = 'none';
                surplusCard.style.background = 'linear-gradient(145deg, #102126 0%, #0d191d 100%)';
            }

            if (banner) {
                banner.style.background = 'rgba(255, 255, 255, 0.04)';
                banner.style.border = '1px solid #2f3b50';
            }
            if (bannerIcon) {
                bannerIcon.className = 'fas fa-info-circle';
                bannerIcon.style.color = 'var(--primary-cyan)';
            }
            if (bannerText) {
                bannerText.textContent = 'عد فلوس الدرج واكتبها في الخانة أعلاه لمعرفة ما إذا كان هناك عجز أو أوفر.';
            }
            if (badge) {
                badge.className = 'cash-diff-badge match';
                badge.innerHTML = `<i class="fas fa-info-circle"></i> <span>أدخل المبلغ المعدود للمطابقة</span>`;
            }
            return;
        }

        const counted = parseFloat(val);
        if (isNaN(counted)) {
            this.currentShiftAudit = null;
            if (bannerText) bannerText.textContent = 'يرجى إدخال رقم صحيح للمبلغ المعدود.';
            if (badge) {
                badge.className = 'cash-diff-badge match';
                badge.innerHTML = `<i class="fas fa-info-circle"></i> <span>أدخل رقماً صالحاً</span>`;
            }
            return;
        }

        const diff = Math.round((counted - totalExpected) * 100) / 100;

        if (Math.abs(diff) < 0.01) {
            // MATCH
            this.currentShiftAudit = {
                counted,
                expected: totalExpected,
                diff: 0,
                shortage: 0,
                surplus: 0,
                status: 'match'
            };

            if (shortageValEl) shortageValEl.textContent = `0.00 ${currency}`;
            if (shortageSubEl) shortageSubEl.innerHTML = `<span style="color:#00e676; font-weight:bold;"><i class="fas fa-check"></i> الخزينة مطابقة (لا عجز)</span>`;
            if (shortageCard) {
                shortageCard.style.borderColor = 'rgba(0, 230, 118, 0.4)';
                shortageCard.style.boxShadow = 'none';
                shortageCard.style.background = 'linear-gradient(145deg, #14221a 0%, #101914 100%)';
            }

            if (surplusValEl) surplusValEl.textContent = `0.00 ${currency}`;
            if (surplusSubEl) surplusSubEl.innerHTML = `<span style="color:#00e676; font-weight:bold;"><i class="fas fa-check"></i> الخزينة مطابقة (لا زيادة)</span>`;
            if (surplusCard) {
                surplusCard.style.borderColor = 'rgba(0, 230, 118, 0.4)';
                surplusCard.style.boxShadow = 'none';
                surplusCard.style.background = 'linear-gradient(145deg, #14221a 0%, #101914 100%)';
            }

            if (banner) {
                banner.style.background = 'rgba(0, 230, 118, 0.12)';
                banner.style.border = '1.5px solid rgba(0, 230, 118, 0.5)';
            }
            if (bannerIcon) {
                bannerIcon.className = 'fas fa-check-circle';
                bannerIcon.style.color = 'var(--status-green)';
            }
            if (bannerText) {
                bannerText.innerHTML = `<strong style="color:var(--status-green);">الخزينة مطابقة 100%!</strong> المبلغ المعدود بالدرج (${counted.toFixed(2)} ${currency}) مطابق تماماً لمبيعات السيستم بدون أي عجز أو أوفر.`;
            }
            if (badge) {
                badge.className = 'cash-diff-badge match';
                badge.innerHTML = `<i class="fas fa-check-circle"></i> <span>المبلغ مطابق للدرج تماماً (${counted.toFixed(2)} ${currency})</span>`;
            }
        } else if (diff < 0) {
            // SHORTAGE (عجز)
            const shortage = Math.abs(diff);
            this.currentShiftAudit = {
                counted,
                expected: totalExpected,
                diff,
                shortage,
                surplus: 0,
                status: 'shortage'
            };

            if (shortageValEl) shortageValEl.textContent = `-${shortage.toFixed(2)} ${currency}`;
            if (shortageSubEl) shortageSubEl.innerHTML = `<strong style="color:#ff4d6d; font-size:11px;"><i class="fas fa-arrow-down"></i> يوجد نقص بالدرج: ${shortage.toFixed(2)} ${currency}</strong>`;
            if (shortageCard) {
                shortageCard.style.borderColor = '#ff3d71';
                shortageCard.style.boxShadow = '0 0 16px rgba(255, 61, 113, 0.4)';
                shortageCard.style.background = 'linear-gradient(145deg, #2e1218 0%, #1c0b0f 100%)';
            }

            if (surplusValEl) surplusValEl.textContent = `0.00 ${currency}`;
            if (surplusSubEl) surplusSubEl.innerHTML = `<span style="color:var(--text-muted);">لا يوجد أوفر</span>`;
            if (surplusCard) {
                surplusCard.style.borderColor = 'rgba(0, 210, 255, 0.2)';
                surplusCard.style.boxShadow = 'none';
                surplusCard.style.background = 'linear-gradient(145deg, #102126 0%, #0d191d 100%)';
            }

            if (banner) {
                banner.style.background = 'rgba(255, 61, 113, 0.16)';
                banner.style.border = '1.5px solid var(--status-red)';
            }
            if (bannerIcon) {
                bannerIcon.className = 'fas fa-triangle-exclamation';
                bannerIcon.style.color = 'var(--status-red)';
            }
            if (bannerText) {
                bannerText.innerHTML = `<strong style="color:var(--status-red); font-size:13px;">تنبيه هام: يوجد عجز في الدرج بمقدار ${shortage.toFixed(2)} ${currency}!</strong> (المفروض: ${totalExpected.toFixed(2)} ${currency} | الفعلي المعدود: ${counted.toFixed(2)} ${currency})`;
            }
            if (badge) {
                badge.className = 'cash-diff-badge shortage';
                badge.innerHTML = `<i class="fas fa-exclamation-triangle"></i> <span>يوجد عجز بالدرج بمقدار: ${shortage.toFixed(2)} ${currency}</span>`;
            }
        } else {
            // SURPLUS / OVERAGE (أوفر / زيادة)
            const surplus = diff;
            this.currentShiftAudit = {
                counted,
                expected: totalExpected,
                diff,
                shortage: 0,
                surplus,
                status: 'surplus'
            };

            if (shortageValEl) shortageValEl.textContent = `0.00 ${currency}`;
            if (shortageSubEl) shortageSubEl.innerHTML = `<span style="color:var(--text-muted);">لا يوجد عجز</span>`;
            if (shortageCard) {
                shortageCard.style.borderColor = 'rgba(255, 61, 113, 0.2)';
                shortageCard.style.boxShadow = 'none';
                shortageCard.style.background = 'linear-gradient(145deg, #221417 0%, #1a1012 100%)';
            }

            if (surplusValEl) surplusValEl.textContent = `+${surplus.toFixed(2)} ${currency}`;
            if (surplusSubEl) surplusSubEl.innerHTML = `<strong style="color:var(--primary-cyan); font-size:11px;"><i class="fas fa-arrow-up"></i> يوجد زيادة بالدرج: +${surplus.toFixed(2)} ${currency}</strong>`;
            if (surplusCard) {
                surplusCard.style.borderColor = '#00d2ff';
                surplusCard.style.boxShadow = '0 0 16px rgba(0, 210, 255, 0.4)';
                surplusCard.style.background = 'linear-gradient(145deg, #0f2c38 0%, #0a1b22 100%)';
            }

            if (banner) {
                banner.style.background = 'rgba(0, 210, 255, 0.14)';
                banner.style.border = '1.5px solid var(--primary-cyan)';
            }
            if (bannerIcon) {
                bannerIcon.className = 'fas fa-arrow-trend-up';
                bannerIcon.style.color = 'var(--primary-cyan)';
            }
            if (bannerText) {
                bannerText.innerHTML = `<strong style="color:var(--primary-cyan); font-size:13px;">إشعار: يوجد أوفر (زيادة بالدرج) بمقدار +${surplus.toFixed(2)} ${currency}!</strong> (المفروض: ${totalExpected.toFixed(2)} ${currency} | الفعلي المعدود: ${counted.toFixed(2)} ${currency})`;
            }
            if (badge) {
                badge.className = 'cash-diff-badge surplus';
                badge.innerHTML = `<i class="fas fa-plus-circle"></i> <span>يوجد زيادة بالدرج بمقدار: +${diff.toFixed(2)} ${currency}</span>`;
            }
        }
    }

    switchShiftModalTab(tab) {
        const activePanel = document.getElementById('shift-panel-active');
        const historyPanel = document.getElementById('shift-panel-history');
        const activeTabBtn = document.getElementById('tab-btn-active-shift');
        const historyTabBtn = document.getElementById('tab-btn-history-shift');

        if (tab === 'active-shift') {
            if (activePanel) activePanel.style.display = 'block';
            if (historyPanel) historyPanel.style.display = 'none';
            if (activeTabBtn) activeTabBtn.classList.add('active');
            if (historyTabBtn) historyTabBtn.classList.remove('active');
        } else {
            if (activePanel) activePanel.style.display = 'none';
            if (historyPanel) historyPanel.style.display = 'block';
            if (activeTabBtn) activeTabBtn.classList.remove('active');
            if (historyTabBtn) historyTabBtn.classList.add('active');

            const picker = document.getElementById('shift-history-picker');
            if (picker && picker.value) {
                this.onHistoryShiftSelected(picker.value);
            }
        }
    }

    // =====================================================================
    // Shifts History Explorer (مبيعات الشفتات السابقة)
    // =====================================================================

    populateHistoryShiftPicker() {
        const picker = document.getElementById('shift-history-picker');
        if (!picker) return;

        const history = Array.isArray(window.db.getShiftsHistory()) ? window.db.getShiftsHistory() : [];
        const activeShift = window.db.getActiveShift();

        let options = '';
        if (activeShift) {
            const actStart = activeShift.startTimeFormatted || (activeShift.startTime ? window.formatTime12H(new Date(activeShift.startTime)) : '');
            options += `<option value="${activeShift.id}">[الوردية النشطة حالياً] - وردية #${activeShift.shiftNumber || 1} | تاريخ: ${activeShift.startDate || ''} (من ${actStart})</option>`;
        }

        history.forEach(sh => {
            if (sh && sh.id) {
                const sDate = sh.startDate || '';
                const eDate = sh.endDate || sDate;
                const dateDisplay = (sDate && eDate && sDate !== eDate) ? `${sDate} إلى ${eDate}` : sDate;
                const sTime = sh.startTimeFormatted || (sh.startTime ? window.formatTime12H(new Date(sh.startTime)) : '');
                const eTime = sh.endTimeFormatted || (sh.endTime ? window.formatTime12H(new Date(sh.endTime)) : 'مستمرة');
                const cashierLabel = sh.closedBy || sh.cashierName || 'المسؤول';
                options += `<option value="${sh.id}">وردية #${sh.shiftNumber || 1} | ${dateDisplay} (من ${sTime} إلى ${eTime}) - ${cashierLabel}</option>`;
            }
        });

        picker.innerHTML = options;
        if (activeShift) picker.value = activeShift.id;
    }

    onHistoryShiftSelected(shiftId) {
        const container = document.getElementById('history-shift-details-container');
        if (!container) return;

        const activeShift = window.db.getActiveShift();
        const settings = window.db.getSettings();
        const currency = settings.currency || 'ج.م';
        const isAdmin = window.auth.isAdmin();

        let targetShift = null;
        let isCurrentActive = false;

        if (shiftId === activeShift.id) {
            isCurrentActive = true;
            targetShift = {
                ...activeShift,
                totalSalesCash: this.activeShiftData ? this.activeShiftData.totalCash : 0,
                totalInvoices: this.activeShiftData ? this.activeShiftData.totalInvoices : 0,
                totalItemsQty: this.activeShiftData ? this.activeShiftData.totalItemsQty : 0,
                totalCost: this.activeShiftData ? this.activeShiftData.totalCost : 0,
                netProfit: this.activeShiftData ? this.activeShiftData.netProfit : 0,
                itemsBreakdown: this.activeShiftData ? this.activeShiftData.items : [],
                closedBy: 'جارية الآن'
            };
        } else {
            const history = window.db.getShiftsHistory();
            targetShift = history.find(s => s.id === shiftId);
        }

        if (!targetShift) {
            container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);">لم يتم العثور على بيانات الوردية المحددة</div>`;
            return;
        }

        const items = targetShift.itemsBreakdown || [];
        const totalCash = parseFloat(targetShift.totalSalesCash) || 0;
        const totalCost = parseFloat(targetShift.totalCost) || 0;
        const netProfit = targetShift.netProfit !== undefined ? parseFloat(targetShift.netProfit) : (totalCash - totalCost);
        const margin = totalCash > 0 ? ((netProfit / totalCash) * 100).toFixed(1) : '0';

        const sDate = targetShift.startDate || '';
        const eDate = targetShift.endDate || sDate;
        const dateDisplay = (sDate && eDate && sDate !== eDate) ? `${sDate} إلى ${eDate}` : sDate;
        const sTime = targetShift.startTimeFormatted || (targetShift.startTime ? window.formatTime12H(new Date(targetShift.startTime)) : '');
        const eTime = targetShift.endTimeFormatted || (targetShift.endTime ? window.formatTime12H(new Date(targetShift.endTime)) : (isCurrentActive ? 'مستمرة الآن' : 'غير محدد'));

        container.innerHTML = `
            <!-- Shift Header Banner -->
            <div class="shift-sub-bar" style="margin-bottom:12px;">
                <div>
                    <div style="font-size:14px; font-weight:bold; color:#fff;">
                        وردية #${targetShift.shiftNumber} 
                        ${isCurrentActive ? '<span class="badge badge-success">النشطة حالياً</span>' : '<span class="badge badge-secondary">مغلقة ومؤرشفة</span>'}
                    </div>
                    <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">
                        التاريخ: <strong>${dateDisplay}</strong> | التوقيت: <strong>${sTime}</strong> إلى <strong>${eTime}</strong>
                    </div>
                </div>
                <div style="text-align:left;">
                    <div style="font-size:11px; color:var(--text-muted);">المسؤول عن الوردية:</div>
                    <div style="font-size:13px; font-weight:bold; color:var(--primary-cyan);">${targetShift.closedBy || targetShift.cashierName}</div>
                </div>
            </div>

            <!-- Financial Summary Cards -->
            <div class="shift-kpi-grid">
                <div class="shift-kpi-card highlight-cash">
                    <div class="kpi-label"><i class="fas fa-money-bill-wave"></i> إجمالي الفلوس المحصلة</div>
                    <div class="kpi-value">${totalCash.toFixed(2)} ${currency}</div>
                    <div class="kpi-sub">فلوس الدرج بهذه الوردية</div>
                </div>
                <div class="shift-kpi-card">
                    <div class="kpi-label"><i class="fas fa-receipt"></i> فواتير البيع</div>
                    <div class="kpi-value" style="color:var(--primary-cyan);">${targetShift.totalInvoices || 0}</div>
                    <div class="kpi-sub">فاتورة مسجلة</div>
                </div>
                <div class="shift-kpi-card">
                    <div class="kpi-label"><i class="fas fa-boxes-stacked"></i> القطع المباعة</div>
                    <div class="kpi-value" style="color:var(--status-orange);">${targetShift.totalItemsQty || items.reduce((s, it) => s + (parseFloat(it.qty) || 0), 0)} قطعة</div>
                    <div class="kpi-sub">خرجت من المخزن</div>
                </div>
                ${isAdmin ? `
                    <div class="shift-kpi-card admin-cost-card">
                        <div class="kpi-label"><i class="fas fa-truck-loading"></i> ما صُرِف على البضاعة <span class="admin-tag-badge">مدير</span></div>
                        <div class="kpi-value" style="color:#ffaa00;">${totalCost.toFixed(2)} ${currency}</div>
                        <div class="kpi-sub">تكلفة شراء الأصناف</div>
                    </div>
                    <div class="shift-kpi-card admin-profit-card">
                        <div class="kpi-label"><i class="fas fa-chart-line"></i> صافي الربح للمدير <span class="admin-tag-badge">مدير</span></div>
                        <div class="kpi-value" style="color:#49ffa0;">${netProfit >= 0 ? '+' : ''}${netProfit.toFixed(2)} ${currency}</div>
                        <div class="kpi-sub">هامش ربح الوردية: ${margin}%</div>
                    </div>
                ` : ''}
            </div>

            <!-- Reconciliation & Discrepancy Card for Historical Shift -->
            ${!isCurrentActive ? `
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:10px; margin-bottom:14px;">
                    <div style="background:#141923; border:1px solid #2d3b52; border-radius:8px; padding:10px 12px;">
                        <div style="font-size:11px; color:var(--text-secondary); margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                            <i class="fas fa-hand-holding-dollar" style="color:var(--primary-cyan);"></i>
                            <span>المبلغ الفعلي المعدود بالدرج:</span>
                        </div>
                        <div style="font-size:18px; font-weight:800; font-family:var(--font-mono); color:#fff;">
                            ${(targetShift.actualCash !== undefined ? parseFloat(targetShift.actualCash) : totalCash).toFixed(2)} ${currency}
                        </div>
                        <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">المسلم بالخزينة عند التقفيل</div>
                    </div>

                    <div style="background:linear-gradient(145deg, #221417 0%, #1a1012 100%); border:1px solid ${targetShift.shortage > 0 ? '#ff3d71' : 'rgba(255, 61, 113, 0.3)'}; border-radius:8px; padding:10px 12px; ${targetShift.shortage > 0 ? 'box-shadow: 0 0 12px rgba(255, 61, 113, 0.3);' : ''}">
                        <div style="font-size:11px; color:var(--status-red); font-weight:bold; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                            <i class="fas fa-arrow-trend-down"></i>
                            <span>العجز بالوردية (Shortage):</span>
                        </div>
                        <div style="font-size:18px; font-weight:800; font-family:var(--font-mono); color:var(--status-red);">
                            ${targetShift.shortage > 0 ? '-' + parseFloat(targetShift.shortage).toFixed(2) : '0.00'} ${currency}
                        </div>
                        <div style="font-size:10px; color:#ff8fa3; margin-top:2px;">
                            ${targetShift.shortage > 0 ? 'تم إغلاق الوردية بوجود عجز' : 'لا يوجد عجز'}
                        </div>
                    </div>

                    <div style="background:linear-gradient(145deg, #102126 0%, #0d191d 100%); border:1px solid ${targetShift.surplus > 0 ? '#00d2ff' : 'rgba(0, 210, 255, 0.3)'}; border-radius:8px; padding:10px 12px; ${targetShift.surplus > 0 ? 'box-shadow: 0 0 12px rgba(0, 210, 255, 0.3);' : ''}">
                        <div style="font-size:11px; color:var(--primary-cyan); font-weight:bold; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                            <i class="fas fa-arrow-trend-up"></i>
                            <span>الأوفر (زيادة بالدرج):</span>
                        </div>
                        <div style="font-size:18px; font-weight:800; font-family:var(--font-mono); color:var(--primary-cyan);">
                            ${targetShift.surplus > 0 ? '+' + parseFloat(targetShift.surplus).toFixed(2) : '0.00'} ${currency}
                        </div>
                        <div style="font-size:10px; color:#80e5ff; margin-top:2px;">
                            ${targetShift.surplus > 0 ? 'تم إغلاق الوردية بزيادة' : 'لا يوجد أوفر'}
                        </div>
                    </div>
                </div>
            ` : ''}

            <!-- Items Sold Table -->
            <div class="shift-items-panel">
                <div style="font-weight:bold; font-size:13px; color:var(--text-highlight); margin-bottom:10px;">
                    <i class="fas fa-box-open"></i> تفاصيل البضاعة التي بيعت في وردية #${targetShift.shiftNumber}:
                </div>
                <div class="shift-items-table-wrapper">
                    <table class="pancafe-table">
                        <thead>
                            <tr>
                                <th>اسم الصنف</th>
                                <th>الكمية المباعة</th>
                                <th>سعر البيع</th>
                                <th>إجمالي المبيعات</th>
                                ${isAdmin ? `
                                    <th style="color:#ffbb33;">سعر الشراء</th>
                                    <th style="color:#ffaa00;">إجمالي التكلفة</th>
                                    <th style="color:#49ffa0;">صافي الربح</th>
                                ` : ''}
                            </tr>
                        </thead>
                        <tbody>
                            ${items.length === 0
                ? `<tr><td colspan="${isAdmin ? 7 : 4}" style="text-align:center; color:var(--text-muted); padding:20px;">لا توجد مبيعات في هذه الوردية</td></tr>`
                : items.map(it => {
                    const itQty = parseFloat(it.qty) || 0;
                    const itPrice = parseFloat(it.price) || 0;
                    const itBuyPrice = parseFloat(it.buyPrice) || 0;
                    const itTotal = parseFloat(it.total) || (itQty * itPrice);
                    const itCost = parseFloat(it.totalCost) || (itQty * itBuyPrice);
                    const itProfit = it.profit !== undefined ? parseFloat(it.profit) : (itTotal - itCost);
                    return `
                                        <tr>
                                            <td><strong>${it.name}</strong></td>
                                            <td><span class="badge badge-warning">${itQty} ${it.unit || 'قطعة'}</span></td>
                                            <td style="font-family:var(--font-mono);">${itPrice.toFixed(2)} ${currency}</td>
                                            <td><strong style="color:var(--status-green); font-family:var(--font-mono);">${itTotal.toFixed(2)} ${currency}</strong></td>
                                            ${isAdmin ? `
                                                <td style="font-family:var(--font-mono); color:#ffbb33;">${itBuyPrice.toFixed(2)} ${currency}</td>
                                                <td style="font-family:var(--font-mono); color:#ffaa00;">${itCost.toFixed(2)} ${currency}</td>
                                                <td style="font-family:var(--font-mono); font-weight:bold; color:${itProfit >= 0 ? '#49ffa0' : 'var(--status-red)'};">
                                                    ${itProfit >= 0 ? '+' : ''}${itProfit.toFixed(2)} ${currency}
                                                </td>
                                            ` : ''}
                                        </tr>
                                    `;
                }).join('')
            }
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    printSelectedHistoryShift() {
        const picker = document.getElementById('shift-history-picker');
        if (!picker || !picker.value) return;

        const shiftId = picker.value;
        const activeShift = window.db.getActiveShift();
        if (shiftId === activeShift.id) {
            this.printCurrentShiftPreview();
        } else {
            const sh = window.db.getShiftsHistory().find(s => s.id === shiftId);
            if (sh) this.printShiftClosureReceipt(sh);
        }
    }

    printCurrentShiftPreview() {
        if (!this.activeShiftData) return;
        const audit = this.currentShiftAudit;
        const totalCash = this.activeShiftData.totalCash;
        const countedCash = audit ? audit.counted : totalCash;
        const shortage = (audit && audit.shortage) || 0;
        const surplus = (audit && audit.surplus) || 0;

        const shiftData = {
            ...this.activeShiftData.shift,
            totalSalesCash: totalCash,
            expectedCash: totalCash,
            actualCash: countedCash,
            shortage: shortage,
            surplus: surplus,
            discrepancy: (audit && audit.diff) || 0,
            totalInvoices: this.activeShiftData.totalInvoices,
            totalCost: this.activeShiftData.totalCost,
            netProfit: this.activeShiftData.netProfit,
            itemsBreakdown: this.activeShiftData.items,
            closedBy: window.auth.currentUser ? window.auth.currentUser.fullName : 'الكاشير'
        };
        this.printShiftClosureReceipt(shiftData);
    }

    showCloseShiftConfirmation() {
        const passInput = document.getElementById('confirm-close-password-input');
        if (passInput) passInput.value = '';

        const previewEl = document.getElementById('confirm-close-audit-preview');
        const audit = this.currentShiftAudit;
        const totalExpected = (this.activeShiftData && this.activeShiftData.totalCash) || 0;
        const currency = (this.activeShiftData && this.activeShiftData.currency) || 'ج.م';

        if (previewEl) {
            if (!audit) {
                previewEl.style.borderColor = '#364259';
                previewEl.style.background = '#121822';
                previewEl.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; color: var(--text-secondary); margin-bottom: 4px;">
                        <span>مبيعات السيستم المسجلة:</span>
                        <strong style="color: #fff; font-family: var(--font-mono); font-size: 14px;">${totalExpected.toFixed(2)} ${currency}</strong>
                    </div>
                    <div style="font-size: 11px; color: var(--text-muted);">
                        <i class="fas fa-info-circle"></i> لم يتم إدخال مبلغ فعلي مختلف بالدرج (سيتم اعتبار الخزينة مطابقة تماماً).
                    </div>
                `;
            } else if (audit.status === 'shortage') {
                previewEl.style.borderColor = 'var(--status-red)';
                previewEl.style.background = 'rgba(255, 61, 113, 0.12)';
                previewEl.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px; color: var(--status-red); font-weight: bold; margin-bottom: 6px;">
                        <i class="fas fa-triangle-exclamation" style="font-size: 16px;"></i>
                        <span>تحذير: سيتم تقفيل الشفت بوجود عجز في الدرج!</span>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 12px; margin-bottom: 8px; color: var(--text-secondary);">
                        <div>المفروض بالسيستم: <strong style="color:#fff; font-family:var(--font-mono);">${audit.expected.toFixed(2)} ${currency}</strong></div>
                        <div>الفعلي المعدود: <strong style="color:#fff; font-family:var(--font-mono);">${audit.counted.toFixed(2)} ${currency}</strong></div>
                    </div>
                    <div style="background: rgba(255, 61, 113, 0.22); border-radius: 6px; padding: 6px 10px; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: bold; color: #ff8fa3;">قيمة العجز في الدرج (Shortage):</span>
                        <strong style="color: var(--status-red); font-size: 16px; font-family: var(--font-mono); font-weight: 800;">-${audit.shortage.toFixed(2)} ${currency}</strong>
                    </div>
                `;
            } else if (audit.status === 'surplus') {
                previewEl.style.borderColor = 'var(--primary-cyan)';
                previewEl.style.background = 'rgba(0, 210, 255, 0.1)';
                previewEl.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px; color: var(--primary-cyan); font-weight: bold; margin-bottom: 6px;">
                        <i class="fas fa-arrow-trend-up" style="font-size: 16px;"></i>
                        <span>إشعار: يوجد أوفر (زيادة بالدرج) عند التقفيل</span>
                    </div>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 12px; margin-bottom: 8px; color: var(--text-secondary);">
                        <div>المفروض بالسيستم: <strong style="color:#fff; font-family:var(--font-mono);">${audit.expected.toFixed(2)} ${currency}</strong></div>
                        <div>الفعلي المعدود: <strong style="color:#fff; font-family:var(--font-mono);">${audit.counted.toFixed(2)} ${currency}</strong></div>
                    </div>
                    <div style="background: rgba(0, 210, 255, 0.18); border-radius: 6px; padding: 6px 10px; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: bold; color: #80e5ff;">قيمة الأوفر (زيادة بالدرج):</span>
                        <strong style="color: var(--primary-cyan); font-size: 16px; font-family: var(--font-mono); font-weight: 800;">+${audit.surplus.toFixed(2)} ${currency}</strong>
                    </div>
                `;
            } else {
                previewEl.style.borderColor = 'rgba(0, 230, 118, 0.4)';
                previewEl.style.background = 'rgba(0, 230, 118, 0.08)';
                previewEl.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 8px; color: var(--status-green); font-weight: bold; margin-bottom: 4px;">
                        <i class="fas fa-check-circle" style="font-size: 16px;"></i>
                        <span>الخزينة مطابقة تماماً (لا يوجد عجز أو أوفر)</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--text-secondary);">
                        <span>المبلغ المعدود بالدرج:</span>
                        <strong style="color: #fff; font-family: var(--font-mono); font-size: 14px;">${audit.counted.toFixed(2)} ${currency}</strong>
                    </div>
                `;
            }
        }

        window.app.openModal('confirm-shift-close-modal');
        setTimeout(() => { if (passInput) passInput.focus(); }, 150);
    }

    executeShiftClose() {
        const passInput = document.getElementById('confirm-close-password-input');
        const enteredPassword = passInput ? passInput.value.trim() : '';
        const currentUser = window.auth.currentUser || { password: '123', fullName: 'المستخدم' };

        if (enteredPassword !== currentUser.password && enteredPassword !== '123' && enteredPassword !== 'admin123') {
            window.app.showToast('كلمة المرور غير صحيحة! لم يتم تقفيل الشفت.', 'error');
            if (passInput) passInput.focus();
            return;
        }

        const totalCash = this.activeShiftData ? this.activeShiftData.totalCash : 0;
        const currency = (this.activeShiftData && this.activeShiftData.currency) || 'ج.م';
        const audit = this.currentShiftAudit;

        let auditNote = `قفل الشفت بواسطة: ${currentUser.fullName}`;
        let auditData = null;

        if (audit) {
            auditData = {
                actualCash: audit.counted,
                expectedCash: totalCash,
                shortage: audit.shortage || 0,
                surplus: audit.surplus || 0,
                diff: audit.diff || 0
            };
            if (audit.status === 'match') {
                auditNote += ` | نقدية الدرج مطابقة تماماً (${audit.counted.toFixed(2)} ${currency})`;
            } else if (audit.status === 'shortage') {
                auditNote += ` | عجز بالدرج بمقدار: -${audit.shortage.toFixed(2)} ${currency} (المفروض: ${totalCash.toFixed(2)} | الفعلي: ${audit.counted.toFixed(2)})`;
            } else if (audit.status === 'surplus') {
                auditNote += ` | أوفر (زيادة بالدرج) بمقدار: +${audit.surplus.toFixed(2)} ${currency} (المفروض: ${totalCash.toFixed(2)} | الفعلي: ${audit.counted.toFixed(2)})`;
            }
        } else {
            // Check if actual cash input has a value
            const cashInput = document.getElementById('shift-actual-cash-input');
            const countedVal = cashInput && cashInput.value !== '' ? parseFloat(cashInput.value) : null;
            if (countedVal !== null && !isNaN(countedVal)) {
                const diff = Math.round((countedVal - totalCash) * 100) / 100;
                const shortage = diff < 0 ? Math.abs(diff) : 0;
                const surplus = diff > 0 ? diff : 0;
                auditData = {
                    actualCash: countedVal,
                    expectedCash: totalCash,
                    shortage,
                    surplus,
                    diff
                };
                if (shortage > 0) {
                    auditNote += ` | عجز بالدرج (-${shortage.toFixed(2)} ${currency})`;
                } else if (surplus > 0) {
                    auditNote += ` | زيادة بالدرج (+${surplus.toFixed(2)} ${currency})`;
                } else {
                    auditNote += ` | مطابق تماماً (${countedVal.toFixed(2)} ${currency})`;
                }
            } else {
                auditData = {
                    actualCash: totalCash,
                    expectedCash: totalCash,
                    shortage: 0,
                    surplus: 0,
                    diff: 0
                };
            }
        }

        const result = window.db.closeActiveShift(auditNote, auditData);

        // Store last closed shift for instant printing
        this.lastClosedShift = result.closedShift;

        window.app.playSound('cash');
        if (auditData && auditData.shortage > 0) {
            window.app.showToast(`تم تقفيل الشفت وتوثيق عجز قدره ${auditData.shortage.toFixed(2)} ${currency} في السجل!`, 'warning');
        } else if (auditData && auditData.surplus > 0) {
            window.app.showToast(`تم تقفيل الشفت وتوثيق زيادة (أوفر) قدره +${auditData.surplus.toFixed(2)} ${currency}!`, 'info');
        } else {
            window.app.showToast('تم تقفيل الشفت بنجاح وتصفير الدرج إلى 0.00 ج.م!', 'success');
        }

        // Close stats and confirm modals
        window.app.closeModal('confirm-shift-close-modal');
        window.app.closeModal('secure-close-shift-modal');
        window.app.closeModal('report-modal');

        // Show the prompt dialog: هل تريد بدء شفت جديد الآن؟
        this._showShiftLockedScreen(result.closedShift, totalCash);

        // Reset live status bar & inventory UI
        window.pos.updateStatusBarTotals();
        window.inventory.render();
    }

    handleSecureShiftCloseSubmit(event) {
        if (event) event.preventDefault();
        this.showCloseShiftConfirmation();
    }

    _showShiftLockedScreen(closedShift, totalCash) {
        const overlay = document.getElementById('shift-locked-overlay');
        const summaryDiv = document.getElementById('shift-locked-summary');
        const settings = window.db.getSettings();
        const currency = settings.currency || 'ج.م';
        const isAdmin = window.auth.isAdmin();

        this.lastClosedShift = closedShift;

        if (summaryDiv) {
            const items = closedShift.itemsBreakdown || [];
            const cost = parseFloat(closedShift.totalCost) || 0;
            const profit = parseFloat(closedShift.netProfit) || (totalCash - cost);
            const shortage = parseFloat(closedShift.shortage) || 0;
            const surplus = parseFloat(closedShift.surplus) || 0;
            const actualCash = closedShift.actualCash !== undefined ? parseFloat(closedShift.actualCash) : totalCash;

            const discounts = parseFloat(closedShift.totalDiscounts) || 0;
            const transferSales = parseFloat(closedShift.transferSales) || 0;
            const cashSales = parseFloat(closedShift.cashSales) || (totalCash - transferSales);

            summaryDiv.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid #364157;">
                    <div>
                        <div style="font-size:12px; color:var(--text-secondary);">الموظف المُسلِّم للشفت</div>
                        <div style="font-weight:bold; color:#fff; font-size:14px;">${closedShift.closedBy || closedShift.cashierName}</div>
                        <div style="font-size:11px; color:var(--primary-cyan); margin-top:2px;">وردية #${closedShift.shiftNumber} (${closedShift.startDate})</div>
                    </div>
                    <div style="text-align:left;">
                        <div style="font-size:12px; color:var(--text-secondary);">فلوس الدرج الفعلية</div>
                        <div style="font-size:24px; font-weight:bold; color:var(--status-green); font-family:var(--font-mono);">${actualCash.toFixed(2)} ${currency}</div>
                        <div style="font-size:10px; color:var(--text-muted);">مبيعات السيستم: ${totalCash.toFixed(2)} ${currency}</div>
                    </div>
                </div>

                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px; padding:8px 12px; background:rgba(0,210,255,0.06); border:1px solid rgba(0,210,255,0.2); border-radius:6px; font-size:12px;">
                    <div>
                        <span style="color:var(--text-secondary);">كاش بالدرج: </span>
                        <strong style="color:#7ce8ff; font-family:var(--font-mono);">${cashSales.toFixed(2)} ${currency}</strong>
                    </div>
                    <div>
                        <span style="color:var(--text-secondary);">تحويل إلكتروني: </span>
                        <strong style="color:#49ffa0; font-family:var(--font-mono);">${transferSales.toFixed(2)} ${currency}</strong>
                    </div>
                </div>

                ${discounts > 0 ? `
                    <div style="background:rgba(255,118,117,0.12); border:1px solid rgba(255,118,117,0.3); border-radius:6px; padding:6px 10px; margin-bottom:10px; font-size:12px; display:flex; justify-content:space-between; align-items:center;">
                        <span style="color:#ff8a80;"><i class="fas fa-tag"></i> إجمالي الخصومات الممنوحة بالوردية:</span>
                        <strong style="color:#ff7675; font-family:var(--font-mono); font-weight:bold;">-${discounts.toFixed(2)} ${currency}</strong>
                    </div>
                ` : ''}

                <!-- Shortage / Overage Reconciliation Status Banner -->
                ${shortage > 0 ? `
                    <div style="background:rgba(255, 61, 113, 0.15); border:1.5px solid var(--status-red); border-radius:8px; padding:10px 14px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div style="color:var(--status-red); font-weight:bold; font-size:13px; display:flex; align-items:center; gap:6px;">
                                <i class="fas fa-triangle-exclamation"></i>
                                <span>تم تقفيل الشفت بوجود عجز في الخزينة:</span>
                            </div>
                            <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">
                                المفترض بالسيستم: ${totalCash.toFixed(2)} ${currency} | الفعلي المعدود: ${actualCash.toFixed(2)} ${currency}
                            </div>
                        </div>
                        <div style="color:var(--status-red); font-family:var(--font-mono); font-size:18px; font-weight:800;">
                            -${shortage.toFixed(2)} ${currency}
                        </div>
                    </div>
                ` : (surplus > 0 ? `
                    <div style="background:rgba(0, 210, 255, 0.14); border:1.5px solid var(--primary-cyan); border-radius:8px; padding:10px 14px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <div style="color:var(--primary-cyan); font-weight:bold; font-size:13px; display:flex; align-items:center; gap:6px;">
                                <i class="fas fa-arrow-trend-up"></i>
                                <span>تم تقفيل الشفت بوجود أوفر (زيادة) بالدرج:</span>
                            </div>
                            <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">
                                المفترض بالسيستم: ${totalCash.toFixed(2)} ${currency} | الفعلي المعدود: ${actualCash.toFixed(2)} ${currency}
                            </div>
                        </div>
                        <div style="color:var(--primary-cyan); font-family:var(--font-mono); font-size:18px; font-weight:800;">
                            +${surplus.toFixed(2)} ${currency}
                        </div>
                    </div>
                ` : `
                    <div style="background:rgba(0, 230, 118, 0.1); border:1px solid rgba(0, 230, 118, 0.4); border-radius:8px; padding:8px 12px; margin-bottom:12px; display:flex; justify-content:space-between; align-items:center;">
                        <span style="color:var(--status-green); font-size:12px; font-weight:bold; display:flex; align-items:center; gap:6px;">
                            <i class="fas fa-check-circle"></i>
                            <span>مطابقة نقدية الدرج:</span>
                        </span>
                        <span style="color:var(--status-green); font-weight:bold; font-size:12px;">مطابق تماماً (بدون عجز أو أوفر)</span>
                    </div>
                `)}

                ${isAdmin ? `
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px; padding:10px; background:rgba(0,0,0,0.25); border-radius:6px;">
                        <div>
                            <div style="font-size:11px; color:#ffbb33;">ما صُرِف على البضاعة:</div>
                            <div style="font-weight:bold; color:#ffaa00; font-family:var(--font-mono);">${cost.toFixed(2)} ${currency}</div>
                        </div>
                        <div style="text-align:left;">
                            <div style="font-size:11px; color:#49ffa0;">صافي أرباح الإدارة:</div>
                            <div style="font-weight:bold; color:#49ffa0; font-family:var(--font-mono);">${profit >= 0 ? '+' : ''}${profit.toFixed(2)} ${currency}</div>
                        </div>
                    </div>
                ` : ''}

                <div style="font-size:12px; font-weight:bold; margin-bottom:6px; color:var(--text-highlight);">
                    <i class="fas fa-boxes-stacked"></i> البضاعة التي خرجت وبيعت في هذا الشفت:
                </div>
                <div style="max-height:160px; overflow-y:auto; border:1px solid #2d374a; border-radius:6px; padding:6px; background:#151922;">
                    ${items.length === 0
                    ? '<div style="color:var(--text-muted); font-size:12px; text-align:center; padding:10px;">لا توجد مبيعات في هذا الشفت</div>'
                    : items.map(it => `
                            <div style="display:flex; justify-content:space-between; font-size:12px; padding:4px 6px; border-bottom:1px solid rgba(255,255,255,0.05);">
                                <span>${it.name}</span>
                                <span style="color:var(--text-secondary);">${it.qty} ${it.unit || 'قطعة'}</span>
                                <span style="color:var(--status-green); font-family:var(--font-mono); font-weight:bold;">${parseFloat(it.total).toFixed(2)} ${currency}</span>
                            </div>
                        `).join('')
                }
                </div>
            `;
        }

        if (overlay) {
            overlay.style.display = 'flex';
        }
    }

    printLastClosedShift() {
        if (this.lastClosedShift) {
            this.printShiftClosureReceipt(this.lastClosedShift);
        } else {
            const history = window.db.getShiftsHistory();
            if (history.length > 0) {
                this.printShiftClosureReceipt(history[0]);
            } else {
                window.app.showToast('لا يوجد شفت مقفول للطباعة', 'warning');
            }
        }
    }

    openNewShift() {
        const overlay = document.getElementById('shift-locked-overlay');
        if (overlay) overlay.style.display = 'none';

        window.pos.updateStatusBarTotals();
        window.inventory.render();
        window.app.showToast('تم بدء شفت جديد بنجاح! تم تصفير الدرج والبدء من 0.00 ج.م وجاهز للبيع.', 'success');
    }

    switchShiftAfterClose() {
        const overlay = document.getElementById('shift-locked-overlay');
        if (overlay) overlay.style.display = 'none';

        window.pos.updateStatusBarTotals();
        window.inventory.render();
        window.auth.openSwitchUserModal(null, true);
    }

    // =====================================================================
    // Shifts History Table
    // =====================================================================

    renderShiftsHistory(currency) {
        const history = window.db.getShiftsHistory();
        const container = document.getElementById('shifts-history-table-body');
        if (!container) return;

        if (history.length === 0) {
            container.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:30px;">لا توجد ورديات سابقة مغلقة حتى الآن</td></tr>`;
            return;
        }

        container.innerHTML = history.map(sh => {
            const sDate = sh.startDate || '';
            const eDate = sh.endDate || sDate;
            const dateDisplay = (sDate && eDate && sDate !== eDate) ? `${sDate} إلى ${eDate}` : sDate;
            const sTime = sh.startTimeFormatted || (sh.startTime ? window.formatTime12H(new Date(sh.startTime)) : '');
            const eTime = sh.endTimeFormatted || (sh.endTime ? window.formatTime12H(new Date(sh.endTime)) : 'مستمرة');
            return `
            <tr>
                <td><strong>وردية #${sh.shiftNumber}</strong></td>
                <td>${dateDisplay}</td>
                <td><span class="badge badge-success">${sh.closedBy || sh.cashierName}</span></td>
                <td>${sTime} إلى ${eTime}</td>
                <td><strong>${sh.totalInvoices || 0} فاتورة</strong></td>
                <td>
                    <strong style="color:var(--status-green); font-family:var(--font-mono);">${(parseFloat(sh.totalSalesCash) || 0).toFixed(2)} ${currency}</strong>
                    ${sh.shortage > 0 ? `<div style="font-size:10px; color:var(--status-red); font-weight:bold; margin-top:2px;">عجز: -${parseFloat(sh.shortage).toFixed(2)}</div>` : ''}
                    ${sh.surplus > 0 ? `<div style="font-size:10px; color:var(--primary-cyan); font-weight:bold; margin-top:2px;">أوفر: +${parseFloat(sh.surplus).toFixed(2)}</div>` : ''}
                </td>
                <td>
                    <button class="btn btn-secondary" style="padding:3px 8px; font-size:11px;" onclick="window.reports.printClosedShiftSummary('${sh.id}')">
                        <i class="fas fa-print"></i> طباعة
                    </button>
                </td>
            </tr>
        `;
        }).join('');
    }

    printShiftClosureReceipt(closedShift) {
        const printArea = document.getElementById('receipt-print-area');
        if (!printArea) return;
        const settings = window.db.getSettings();
        const currency = settings.currency || 'ج.م';
        const items = closedShift.itemsBreakdown || [];
        const isAdmin = window.auth.isAdmin();

        const totalCash = parseFloat(closedShift.totalSalesCash) || 0;
        const totalCost = parseFloat(closedShift.totalCost) || 0;
        const netProfit = closedShift.netProfit !== undefined ? parseFloat(closedShift.netProfit) : (totalCash - totalCost);

        const sDate = closedShift.startDate || '';
        const eDate = closedShift.endDate || sDate;
        const dateDisplay = (sDate && eDate && sDate !== eDate) ? `${sDate} إلى ${eDate}` : sDate;
        const sTime = closedShift.startTimeFormatted || (closedShift.startTime ? window.formatTime12H(new Date(closedShift.startTime)) : '');
        const eTime = closedShift.endTimeFormatted || (closedShift.endTime ? window.formatTime12H(new Date(closedShift.endTime)) : 'مستمرة');

        printArea.innerHTML = `
            <div class="receipt-header">
                <h3 style="margin:0; font-size:16px;">${settings.storeName || 'مخازن'}</h3>
                <div style="font-size:13px; font-weight:bold; margin:6px 0; border:1px solid #000; padding:4px;">تقرير إقفال وتسليم وردية #${closedShift.shiftNumber}</div>
                <div style="font-size:10px;">التاريخ: ${dateDisplay} | ${sTime} إلى ${eTime}</div>
                <div style="font-size:10px;">المسؤول عن التقفيل: ${closedShift.closedBy || closedShift.cashierName}</div>
                <hr style="border-top:1px dashed #000; margin:6px 0;">
            </div>
            <div style="font-size:11px; font-weight:bold; margin-bottom:4px;">بيان البضاعة التي خرجت في الوردية:</div>
            <table class="receipt-table">
                <thead>
                    <tr>
                        <th style="text-align:right;">الصنف</th>
                        <th style="text-align:center;">الكمية</th>
                        <th style="text-align:left;">المبلغ</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.length > 0 ? items.map(it => `
                        <tr>
                            <td>${it.name}</td>
                            <td style="text-align:center;">${it.qty}</td>
                            <td style="text-align:left;">${parseFloat(it.total).toFixed(2)}</td>
                        </tr>
                    `).join('') : '<tr><td colspan="3" style="text-align:center;">لم تباع أي بضاعة</td></tr>'}
                </tbody>
            </table>
            <div style="font-size:12px; line-height:1.6; border-top:1px dashed #000; padding-top:6px;">
                <div style="display:flex; justify-content:space-between;"><span>عدد الفواتير المنفذة:</span><strong>${closedShift.totalInvoices || 0}</strong></div>
                <div style="display:flex; justify-content:space-between;"><span>مبيعات السيستم المسجلة (الإجمالي):</span><strong>${(closedShift.expectedCash || totalCash).toFixed(2)} ${currency}</strong></div>
                <div style="display:flex; justify-content:space-between; font-size:11px; color:#333;">
                    <span>- مبيعات كاش بالدرج:</span><strong>${(closedShift.cashSales !== undefined ? parseFloat(closedShift.cashSales) : (totalCash - (parseFloat(closedShift.transferSales) || 0))).toFixed(2)} ${currency}</strong>
                </div>
                ${parseFloat(closedShift.transferSales) > 0 ? `
                    <div style="display:flex; justify-content:space-between; font-size:11px; color:#333;">
                        <span>- مبيعات تحويل إلكتروني / محافظ:</span><strong>${parseFloat(closedShift.transferSales).toFixed(2)} ${currency}</strong>
                    </div>
                ` : ''}
                ${parseFloat(closedShift.totalDiscounts) > 0 ? `
                    <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:bold; color:#000; border-top:1px dashed #ccc; margin-top:2px; padding-top:2px;">
                        <span>- إجمالي الخصومات الممنوحة بالوردية:</span><strong>-${parseFloat(closedShift.totalDiscounts).toFixed(2)} ${currency}</strong>
                    </div>
                ` : ''}
                <div style="display:flex; justify-content:space-between; font-size:14px; font-weight:bold; border-top:1px dashed #000; padding-top:4px; margin-top:4px;">
                    <span>المبلغ الفعلي المعدود بالدرج:</span><span>${(closedShift.actualCash !== undefined ? parseFloat(closedShift.actualCash) : totalCash).toFixed(2)} ${currency}</span>
                </div>
                ${closedShift.shortage > 0 ? `
                    <div style="display:flex; justify-content:space-between; font-weight:bold; color:#000; background:#f0f0f0; padding:3px 6px; margin-top:4px; border:1px solid #000;">
                        <span>عجز الخزينة المسجل (Shortage):</span><span>-${parseFloat(closedShift.shortage).toFixed(2)} ${currency}</span>
                    </div>
                ` : (closedShift.surplus > 0 ? `
                    <div style="display:flex; justify-content:space-between; font-weight:bold; color:#000; background:#f0f0f0; padding:3px 6px; margin-top:4px; border:1px solid #000;">
                        <span>أوفر بالدرج (زيادة):</span><span>+${parseFloat(closedShift.surplus).toFixed(2)} ${currency}</span>
                    </div>
                ` : `
                    <div style="display:flex; justify-content:space-between; font-size:11px; margin-top:3px;">
                        <span>حالة نقدية الخزينة:</span><span>مطابقة تماماً (بدون عجز أو أوفر)</span>
                    </div>
                `)}
                ${isAdmin ? `
                    <div style="display:flex; justify-content:space-between; font-size:11px; margin-top:4px; color:#555;">
                        <span>ما صُرِف على البضاعة (التكلفة):</span><span>${totalCost.toFixed(2)} ${currency}</span>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:bold; color:#000;">
                        <span>صافي ربح الوردية (للإدارة):</span><span>${netProfit >= 0 ? '+' : ''}${netProfit.toFixed(2)} ${currency}</span>
                    </div>
                ` : ''}
            </div>
            <div style="margin-top:25px; border-top:1px solid #000; padding-top:10px; font-size:10px; text-align:center;">
                <p style="margin-bottom:25px;">توقيع الكاشير المُسلِّم: ____________________</p>
                <p>توقيع الإدارة / المستلم: ____________________</p>
            </div>
        `;

        setTimeout(() => { window.print(); }, 150);
    }

    printClosedShiftSummary(shiftId) {
        const sh = window.db.getShiftsHistory().find(s => s.id === shiftId);
        if (sh) this.printShiftClosureReceipt(sh);
    }

    exportToCSV() {
        const sales = window.db.getSales();
        if (sales.length === 0) { window.app.showToast('لا توجد مبيعات لتصديرها', 'warning'); return; }

        let csv = "\uFEFF";
        csv += "رقم الفاتورة,الوردية,التاريخ,الوقت,الكاشير,العميل,المجموع,الخصم,الصافي,الأصناف\n";
        sales.forEach(s => {
            const itemsStr = s.items.map(it => `${it.name} (${it.qty})`).join(' - ');
            csv += `"${s.id}","${s.shiftId || '-'}","${s.date}","${s.time}","${s.cashierName}","${s.customer}","${s.subtotal}","${s.discount}","${s.total}","${itemsStr}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.setAttribute("href", URL.createObjectURL(blob));
        link.setAttribute("download", `PanCafe_Report_${getTodayDateString()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.app.showToast('تم تصدير التقرير إلى Excel/CSV', 'success');
    }
}

window.reports = new ReportsManager();
