// ==========================================================================
// PanCafe Pro Inventory - POS & Quick Sales Register
// ==========================================================================

class PosManager {
    constructor() {
        this.cart = []; // [{ itemId, name, price, buyPrice, qty, unit, total }]
        this.customerName = 'عميل نقدي';
        this.discountAmount = 0;
        this.paymentMethod = 'cash';
        this.paidAmount = 0;
    }

    init() {
        this.updateStatusBarTotals();
    }

    openPosModal() {
        this.cart = [];
        this.customerName = 'عميل نقدي';
        this.discountAmount = 0;
        this.paidAmount = 0;
        this.renderPosItemsSelector();
        this.renderCart();
        window.app.openModal('pos-modal');
    }

    quickAddAndOpenCart(itemId) {
        this.openPosModal();
        this.addToCart(itemId, 1);
    }

    addToCart(itemId, qty = 1) {
        const item = window.db.getItems().find(it => it.id === itemId);
        if (!item) return;

        if (item.qty <= 0) {
            window.app.showToast(`عفواً، الصنف ${item.name} غير متوفر بالمخزن!`, 'warning');
            return;
        }

        const existing = this.cart.find(c => c.itemId === itemId);
        if (existing) {
            if (existing.qty + qty > item.qty) {
                window.app.showToast(`الكمية المطلوبة تتجاوز المخزون المتاح (${item.qty})!`, 'warning');
                return;
            }
            existing.qty = Math.round((existing.qty + qty) * 100) / 100;
            existing.total = existing.qty * existing.price;
        } else {
            if (qty > item.qty) {
                window.app.showToast(`الكمية المطلوبة تتجاوز المخزون المتاح (${item.qty})!`, 'warning');
                return;
            }
            this.cart.push({
                itemId: item.id,
                name: item.name,
                price: parseFloat(item.sellPrice),
                buyPrice: parseFloat(item.buyPrice),
                qty: qty,
                unit: item.unit || 'قطعة',
                maxQty: item.qty,
                total: qty * parseFloat(item.sellPrice)
            });
        }

        window.app.playSound('click');
        this.renderCart();
    }

    updateCartQty(itemId, newQty) {
        const itemInCart = this.cart.find(c => c.itemId === itemId);
        if (!itemInCart) return;

        const val = parseFloat(newQty);
        if (isNaN(val) || val <= 0) {
            this.removeFromCart(itemId);
            return;
        }

        if (val > itemInCart.maxQty) {
            window.app.showToast(`الكمية المتاحة في المخزن هي ${itemInCart.maxQty} فقط`, 'warning');
            itemInCart.qty = itemInCart.maxQty;
        } else {
            itemInCart.qty = val;
        }

        itemInCart.total = itemInCart.qty * itemInCart.price;
        this.renderCart();
    }

    addHalfUnit(itemId) {
        this.addToCart(itemId, 0.5);
    }

    removeFromCart(itemId) {
        this.cart = this.cart.filter(c => c.itemId !== itemId);
        this.renderCart();
    }

    clearCart() {
        this.cart = [];
        this.renderCart();
    }

    renderPosItemsSelector() {
        const container = document.getElementById('pos-selector-grid');
        if (!container) return;

        const items = window.db.getItems();
        const settings = window.db.getSettings();
        const currency = settings.currency || 'ج.م';

        if (items.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 40px 10px; color: var(--text-muted);">
                    <i class="fas fa-box-open" style="font-size: 38px; margin-bottom: 8px; opacity: 0.5;"></i>
                    <p style="font-size: 14px; font-weight: bold; margin-bottom: 4px;">المخزن فارغ حالياً</p>
                    <p style="font-size: 11px;">قم بإضافة أصناف جديدة للمخزن لتتمكن من بيعها</p>
                </div>
            `;
            return;
        }

        container.innerHTML = items.map(it => `
            <div class="pos-quick-item-card ${it.qty <= 0 ? 'disabled' : ''}" onclick="window.pos.addToCart('${it.id}', 1)">
                <div style="font-size: 20px; color: var(--primary-cyan); margin-bottom: 4px;">
                    <i class="${it.icon || 'fas fa-box'}"></i>
                </div>
                <div class="pos-item-title">${it.name}</div>
                <div style="font-size: 13px; font-weight: bold; color: var(--status-green); font-family: var(--font-mono);">${parseFloat(it.sellPrice).toFixed(2)} ${currency}</div>
                <div style="font-size: 10px; color: var(--text-muted);">رصيد: ${it.qty} ${it.unit || ''}</div>
            </div>
        `).join('');
    }

    renderCart() {
        const listContainer = document.getElementById('pos-cart-list');
        const countBadge = document.getElementById('pos-cart-count');
        const subtotalEl = document.getElementById('pos-cart-subtotal');
        const totalEl = document.getElementById('pos-cart-total');
        const changeEl = document.getElementById('pos-cart-change');
        const checkoutBtn = document.getElementById('pos-checkout-btn');
        const settings = window.db.getSettings();
        const currency = settings.currency || 'ج.م';

        if (!listContainer) return;

        const totalItemsCount = this.cart.reduce((sum, it) => sum + it.qty, 0);
        const subtotal = this.cart.reduce((sum, it) => sum + it.total, 0);
        const finalTotal = Math.max(0, subtotal - (parseFloat(this.discountAmount) || 0));

        if (countBadge) countBadge.textContent = totalItemsCount;
        if (subtotalEl) subtotalEl.textContent = `${subtotal.toFixed(2)} ${currency}`;
        if (totalEl) totalEl.textContent = `${finalTotal.toFixed(2)} ${currency}`;

        // Calculate change
        const paidInput = document.getElementById('pos-paid-input');
        const paid = paidInput ? (parseFloat(paidInput.value) || finalTotal) : finalTotal;
        const change = Math.max(0, paid - finalTotal);
        if (changeEl) changeEl.textContent = `${change.toFixed(2)} ${currency}`;

        if (checkoutBtn) {
            checkoutBtn.disabled = this.cart.length === 0;
        }

        if (this.cart.length === 0) {
            listContainer.innerHTML = `
                <div style="text-align: center; color: var(--text-muted); padding: 40px 10px;">
                    <i class="fas fa-shopping-basket" style="font-size: 32px; opacity: 0.4; margin-bottom: 8px;"></i>
                    <p style="font-size: 13px;">الفاتورة فارغة، اضغط على صنف لإضافته</p>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = this.cart.map(item => `
            <div class="cart-item-row">
                <div class="cart-item-info">
                    <div class="cart-item-title">${item.name}</div>
                    <div class="cart-item-price">${parseFloat(item.price).toFixed(2)} ${currency} × ${item.qty} = <strong>${item.total.toFixed(2)} ${currency}</strong></div>
                </div>
                <div class="qty-stepper">
                    <button class="qty-btn" title="شيل واحد من الكمية" onclick="window.pos.updateCartQty('${item.itemId}', ${Math.max(0, item.qty - 1)})" style="background:#c0392b;">-</button>
                    <input type="number" step="1" min="0" class="qty-input selectable-text" value="${item.qty}" onchange="window.pos.updateCartQty('${item.itemId}', this.value)">
                    <button class="qty-btn" title="أضف واحد للكمية" onclick="window.pos.updateCartQty('${item.itemId}', ${item.qty + 1})" style="background:#27ae60;">+</button>
                </div>
                <button class="win-btn close" title="حذف الصنف بالكامل من السلة" onclick="window.pos.removeFromCart('${item.itemId}')">
                    <i class="fas fa-trash-alt" style="font-size:11px;"></i>
                </button>
            </div>
        `).join('');
    }

    processCheckout() {
        if (this.cart.length === 0) {
            window.app.showToast('سلة البيع فارغة!', 'error');
            return;
        }

        const subtotal = this.cart.reduce((sum, it) => sum + it.total, 0);
        const discount = parseFloat(document.getElementById('pos-discount-input')?.value) || 0;
        const total = Math.max(0, subtotal - discount);
        const customerName = document.getElementById('pos-customer-input')?.value || 'عميل نقدي';
        const paidInput = document.getElementById('pos-paid-input');
        const paid = paidInput && paidInput.value !== '' ? parseFloat(paidInput.value) : total;
        const change = Math.max(0, paid - total);
        const currentUser = window.auth.currentUser;

        const saleRecord = {
            cashierId: currentUser.id,
            cashierName: currentUser.fullName,
            customer: customerName,
            items: [...this.cart],
            subtotal: subtotal,
            discount: discount,
            total: total,
            paid: paid,
            change: change,
            paymentMethod: this.paymentMethod
        };

        const completedSale = window.db.addSale(saleRecord);

        window.app.playSound('cash');
        window.app.showToast(`تم إتمام الفاتورة #${completedSale.id} بنجاح ومبلغ ${total.toFixed(2)} ج.م`, 'success');

        // Render receipt in print area and optionally print
        this.printReceipt(completedSale);

        window.app.closeModal('pos-modal');
        this.cart = [];

        // Refresh UI
        window.inventory.render();
        this.updateStatusBarTotals();
    }

    printReceipt(sale) {
        const printArea = document.getElementById('receipt-print-area');
        if (!printArea) return;

        const settings = window.db.getSettings();
        const currency = settings.currency || 'ج.م';

        printArea.innerHTML = `
            <div class="receipt-header">
                <h3 style="margin: 0; font-size: 16px;">${settings.storeName || 'مخازن'}</h3>
                <div style="font-size: 11px; margin: 4px 0;">فاتورة مبيعات نقدية #${sale.id}</div>
                <div style="font-size: 10px;">التاريخ: ${sale.date} | ${sale.time}</div>
                <div style="font-size: 10px;">الكاشير: ${sale.cashierName}</div>
                <div style="font-size: 10px;">العميل: ${sale.customer}</div>
                <hr style="border-top: 1px dashed #000; margin: 6px 0;">
            </div>
            <table class="receipt-table">
                <thead>
                    <tr>
                        <th style="text-align: right;">الصنف</th>
                        <th style="text-align: center;">الكمية</th>
                        <th style="text-align: left;">الإجمالي</th>
                    </tr>
                </thead>
                <tbody>
                    ${sale.items.map(it => `
                        <tr>
                            <td>${it.name}</td>
                            <td style="text-align: center;">${it.qty}</td>
                            <td style="text-align: left;">${it.total.toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <div style="border-top: 1px dashed #000; padding-top: 6px; font-size: 11px;">
                <div style="display: flex; justify-content: space-between;">
                    <span>المجموع:</span>
                    <span>${sale.subtotal.toFixed(2)} ${currency}</span>
                </div>
                ${sale.discount > 0 ? `
                    <div style="display: flex; justify-content: space-between;">
                        <span>الخصم:</span>
                        <span>-${sale.discount.toFixed(2)} ${currency}</span>
                    </div>
                ` : ''}
                <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 13px; margin: 4px 0;">
                    <span>الصافي المطلوب:</span>
                    <span>${sale.total.toFixed(2)} ${currency}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span>المدفوع:</span>
                    <span>${sale.paid.toFixed(2)} ${currency}</span>
                </div>
                <div style="display: flex; justify-content: space-between;">
                    <span>الباقي للعميل:</span>
                    <span>${sale.change.toFixed(2)} ${currency}</span>
                </div>
            </div>
            <div class="receipt-footer" style="margin-top: 12px;">
                <p style="font-size: 10px; margin: 0;">${settings.receiptFooter}</p>
                <p style="font-size: 9px; margin-top: 4px; color: #555;">نظام مخازن</p>
            </div>
        `;

        // Trigger native print
        setTimeout(() => {
            window.print();
        }, 150);
    }

    updateStatusBarTotals() {
        const activeShift = window.db.getActiveShift();
        const sales = window.db.getSalesForActiveShift();
        const currentUser = window.auth.currentUser;
        const isAdmin = window.auth.isAdmin();
        const settings = window.db.getSettings();
        const currency = settings.currency || 'ج.م';

        // Filter sales for active shift (if cashier, restrict to cashier or show active shift)
        let shiftSales = sales;
        if (!isAdmin) {
            shiftSales = sales.filter(s => s.cashierId === currentUser.id);
        }

        const totalCash = shiftSales.reduce((sum, s) => sum + parseFloat(s.total), 0);
        const totalCount = shiftSales.length;

        const countEl = document.getElementById('status-today-sales-count');
        const cashEl = document.getElementById('status-today-cash');
        const shiftBadge = document.getElementById('status-active-shift-badge');

        if (countEl) countEl.textContent = totalCount;
        if (cashEl) cashEl.textContent = `${totalCash.toFixed(2)} ${currency}`;
        if (shiftBadge) {
            shiftBadge.textContent = `وردية #${activeShift.shiftNumber} (${activeShift.startTimeFormatted || ''})`;
        }
    }
}

window.pos = new PosManager();
