class InventoryManager {
    constructor() {
        this.searchQuery = '';
        this.currentView = 'grid'; // 'grid' or 'table'
        this.editingItemId = null;
    }

    init() {
        this.render();
    }

    setSearch(query) {
        this.searchQuery = (query || '').toLowerCase().trim();
        this.render();
    }

    setView(viewMode) {
        this.currentView = viewMode;
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === viewMode);
        });
        this.render();
    }

    getFilteredItems() {
        let items = window.db.getItems();

        // Search query filter (matches name, barcode, code, notes)
        if (this.searchQuery) {
            items = items.filter(it => 
                (it.name && it.name.toLowerCase().includes(this.searchQuery)) ||
                (it.barcode && it.barcode.includes(this.searchQuery)) ||
                (it.code && it.code.toLowerCase().includes(this.searchQuery)) ||
                (it.notes && it.notes.toLowerCase().includes(this.searchQuery))
            );
        }

        return items;
    }

    getItemStockStatus(item) {
        const qty = parseFloat(item.qty) || 0;
        const minQty = parseFloat(item.minQty) || 5;

        if (qty <= 0) {
            return { type: 'out-stock', label: 'نفذ المخزون', badgeClass: 'badge-danger', dotColor: 'var(--status-red)' };
        } else if (qty <= minQty) {
            return { type: 'low-stock', label: 'قرب ينفذ', badgeClass: 'badge-warning', dotColor: 'var(--status-orange)' };
        } else {
            return { type: 'in-stock', label: 'متوفر', badgeClass: 'badge-success', dotColor: 'var(--status-green)' };
        }
    }

    render() {
        const container = document.getElementById('items-view-container');
        if (!container) return;

        const items = this.getFilteredItems();
        const isAdmin = window.auth.isAdmin();
        const settings = window.db.getSettings();
        const currency = settings.currency || 'ج.م';

        // Update items count in header and status bar
        const countBadge = document.getElementById('items-count-badge');
        const countDisplay = document.getElementById('items-count-display');
        if (countBadge) countBadge.textContent = `${items.length} صنف`;
        if (countDisplay) countDisplay.textContent = `${items.length} صنف`;

        if (items.length === 0) {
            container.innerHTML = `
                <div class="empty-inventory-container" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 460px; padding: 40px 20px; text-align: center;">
                    <div style="font-size: 56px; color: #485872; margin-bottom: 14px; opacity: 0.7;">
                        <i class="fas fa-box-open"></i>
                    </div>
                    <p style="font-size: 15px; font-weight: bold; color: #8496b2; margin-bottom: 16px;">
                        ${this.searchQuery ? 'لا يوجد أصناف مطابقه للبحث' : 'المخزن فارغ حالياً (لا توجد أصناف)'}
                    </p>
                    ${isAdmin ? `
                        <button type="button" class="btn btn-primary" style="padding: 10px 24px; font-size: 13.5px; font-weight: bold; border-radius: 6px; box-shadow: 0 4px 18px rgba(0, 132, 255, 0.4); display: inline-flex; align-items: center; gap: 8px;" onclick="window.inventory.openAddItemModal()">
                            <i class="fas fa-plus"></i>
                            <span>إضافة صنف جديد للمخزن</span>
                        </button>
                    ` : `
                        <span style="font-size: 12px; color: var(--text-muted); background: var(--bg-dark-panel); padding: 8px 16px; border-radius: 6px; border: 1px solid var(--border-color);">
                            <i class="fas fa-info-circle"></i> يرجى تسجيل الدخول بحساب المدير لإضافة أصناف جديدة
                        </span>
                    `}
                </div>
            `;
            return;
        }

        if (this.currentView === 'grid') {
            container.innerHTML = `
                <div class="items-grid">
                    ${items.map(item => {
                        const status = this.getItemStockStatus(item);
                        const qty = parseFloat(item.qty) || 0;
                        const maxVisual = Math.max(qty, (parseFloat(item.minQty) || 5) * 3, 20);
                        const percent = Math.min(100, Math.round((qty / maxVisual) * 100));

                        return `
                            <div class="item-card ${status.type}" id="card-${item.id}">
                                <div class="card-header-bar">
                                    <span class="code-badge">${item.code || 'BOX'}</span>
                                    <div class="status-indicator">
                                        <span class="status-dot"></span>
                                        <span>${status.label}</span>
                                    </div>
                                </div>
                                <div class="card-body">
                                    <div class="item-icon-wrapper">
                                        <i class="${item.icon || 'fas fa-box'}"></i>
                                    </div>
                                    <div class="item-name" title="${item.name}">${item.name}</div>
                                    <div class="item-price-tag">${parseFloat(item.sellPrice).toFixed(2)} ${currency}</div>
                                    
                                    <div class="stock-meter">
                                        <div class="stock-meter-label">
                                            <span>الرصيد: <strong>${qty} ${item.unit || 'قطعة'}</strong></span>
                                            ${isAdmin ? `<span style="color: var(--text-muted); font-size: 10px;">تكلفة: ${item.buyPrice}</span>` : ''}
                                        </div>
                                        <div class="stock-meter-bar">
                                            <div class="stock-meter-fill" style="width: ${percent}%;"></div>
                                        </div>
                                    </div>
                                </div>
                                <div class="card-footer-actions">
                                    <button class="quick-sell-btn" ${qty <= 0 ? 'disabled' : ''} onclick="window.pos.quickAddAndOpenCart('${item.id}')">
                                        <i class="fas fa-cart-plus"></i>
                                        <span>بيع سريع</span>
                                    </button>
                                    ${isAdmin ? `
                                        <button class="card-action-icon" title="توريد كمية جديدة" onclick="window.inventory.openStockInModal('${item.id}')">
                                            <i class="fas fa-truck-loading" style="color: var(--status-green);"></i>
                                        </button>
                                        <button class="card-action-icon" title="تعديل الصنف" onclick="window.inventory.openEditItemModal('${item.id}')">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                        <button class="card-action-icon delete" title="حذف الصنف" onclick="window.inventory.deleteItem('${item.id}')">
                                            <i class="fas fa-trash-alt"></i>
                                        </button>
                                    ` : ''}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        } else {
            // Table View
            container.innerHTML = `
                <div class="table-view-container">
                    <table class="pancafe-table">
                        <thead>
                            <tr>
                                <th>كود</th>
                                <th>اسم الصنف</th>
                                <th>التصنيف</th>
                                <th>الباركود</th>
                                <th>سعر البيع</th>
                                ${isAdmin ? '<th>سعر الشراء</th>' : ''}
                                <th>الكمية بالمخزن</th>
                                <th>الحالة</th>
                                <th style="text-align: center;">إجراءات</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.map(item => {
                                const status = this.getItemStockStatus(item);
                                const categories = window.DEFAULT_CATEGORIES || (typeof DEFAULT_CATEGORIES !== 'undefined' ? DEFAULT_CATEGORIES : []);
                                const catObj = categories.find(c => c.id === item.category);
                                const sellPriceFormatted = (parseFloat(item.sellPrice) || 0).toFixed(2);
                                const buyPriceFormatted = (parseFloat(item.buyPrice) || 0).toFixed(2);
                                return `
                                    <tr>
                                        <td><span class="code-badge">${item.code || '-'}</span></td>
                                        <td>
                                            <div style="display: flex; align-items: center; gap: 8px;">
                                                <i class="${item.icon || 'fas fa-box'}" style="color: var(--primary-cyan);"></i>
                                                <strong>${item.name}</strong>
                                            </div>
                                        </td>
                                        <td>${catObj ? catObj.name : (item.category === 'general' ? 'صنف عام' : item.category)}</td>
                                        <td><code style="font-family: var(--font-mono); color: var(--text-muted);">${item.barcode || '-'}</code></td>
                                        <td><strong style="color: var(--status-green); font-family: var(--font-mono);">${sellPriceFormatted} ${currency}</strong></td>
                                        ${isAdmin ? `<td><span style="color: var(--text-secondary); font-family: var(--font-mono);">${buyPriceFormatted} ${currency}</span></td>` : ''}
                                        <td><strong>${item.qty}</strong> <span style="font-size: 11px; color: var(--text-muted);">${item.unit || 'قطعة'}</span></td>
                                        <td><span class="badge ${status.badgeClass}">${status.label}</span></td>
                                        <td style="text-align: center;">
                                            <div style="display: inline-flex; gap: 6px;">
                                                <button class="btn btn-primary" style="padding: 4px 8px; font-size: 11px;" ${item.qty <= 0 ? 'disabled' : ''} onclick="window.pos.quickAddAndOpenCart('${item.id}')">
                                                    <i class="fas fa-cart-plus"></i> بيع
                                                </button>
                                                ${isAdmin ? `
                                                    <button class="card-action-icon" title="توريد للمخزن" onclick="window.inventory.openStockInModal('${item.id}')">
                                                        <i class="fas fa-plus"></i>
                                                    </button>
                                                    <button class="card-action-icon" title="تعديل" onclick="window.inventory.openEditItemModal('${item.id}')">
                                                        <i class="fas fa-edit"></i>
                                                    </button>
                                                    <button class="card-action-icon delete" title="حذف" onclick="window.inventory.deleteItem('${item.id}')">
                                                        <i class="fas fa-trash-alt"></i>
                                                    </button>
                                                ` : ''}
                                            </div>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }
    }

    // Modal Triggers
    openAddItemModal() {
        if (!window.auth.isAdmin()) {
            window.app.showToast('عفواً، إضافة بضاعة جديدة للمخزن متاحة للمدير فقط!', 'error');
            return;
        }
        this.editingItemId = null;
        document.getElementById('item-modal-title').textContent = 'إضافة صنف جديد للمخزن';
        document.getElementById('item-form').reset();
        document.getElementById('item-id-input').value = '';
        window.app.openModal('item-modal');
    }

    openEditItemModal(itemId) {
        if (!window.auth.isAdmin()) {
            window.app.showToast('عفواً، تعديل بيانات الأصناف متاح للمدير فقط!', 'error');
            return;
        }
        const item = window.db.getItems().find(it => it.id === itemId);
        if (!item) return;

        this.editingItemId = itemId;
        document.getElementById('item-modal-title').textContent = `تعديل صنف: ${item.name}`;
        document.getElementById('item-id-input').value = item.id;
        document.getElementById('item-name-input').value = item.name;
        document.getElementById('item-category-input').value = item.category || 'drinks';
        document.getElementById('item-barcode-input').value = item.barcode || '';
        document.getElementById('item-buy-price-input').value = item.buyPrice;
        document.getElementById('item-sell-price-input').value = item.sellPrice;
        document.getElementById('item-qty-input').value = item.qty;
        document.getElementById('item-min-qty-input').value = item.minQty || 5;
        document.getElementById('item-unit-input').value = item.unit || 'قطعة';
        document.getElementById('item-notes-input').value = item.notes || '';

        window.app.openModal('item-modal');
    }

    saveItemFromForm(formData) {
        if (!window.auth.isAdmin()) {
            window.app.showToast('عفواً، إضافة الأصناف وتعديلها متاح لحساب المدير فقط!', 'error');
            return;
        }

        const name = (formData.name || '').trim();
        if (!name) {
            window.app.showToast('يرجى كتابة اسم الصنف / المنتج', 'warning');
            return;
        }

        const itemId = formData.id;
        const itemData = {
            name: name,
            category: formData.category || 'general',
            barcode: (formData.barcode || '').trim(),
            buyPrice: parseFloat(formData.buyPrice) || 0,
            sellPrice: parseFloat(formData.sellPrice) || 0,
            qty: parseFloat(formData.qty) || 0,
            minQty: parseFloat(formData.minQty) || 5,
            unit: (formData.unit || 'قطعة').trim() || 'قطعة',
            notes: (formData.notes || '').trim(),
            icon: this.getIconForCategory(formData.category || 'general')
        };

        if (itemId) {
            window.db.updateItem(itemId, itemData);
            window.app.showToast(`تم تحديث بيانات الصنف (${name}) بنجاح`, 'success');
        } else {
            window.db.addItem(itemData);
            window.app.showToast(`تمت إضافة الصنف (${name}) إلى المخزن بنجاح`, 'success');
        }

        window.app.closeModal('item-modal');
        this.render();
    }

    deleteItem(itemId) {
        if (!window.auth.isAdmin()) return;
        const item = window.db.getItems().find(it => it.id === itemId);
        if (!item) return;

        if (confirm(`هل أنت متأكد من حذف الصنف (${item.name}) نهائياً من المخزن؟`)) {
            window.db.deleteItem(itemId);
            window.app.showToast(`تم حذف الصنف ${item.name}`, 'warning');
            this.render();
        }
    }

    // Stock In / Restock
    openStockInModal(itemId) {
        if (!window.auth.isAdmin()) return;
        const item = window.db.getItems().find(it => it.id === itemId);
        if (!item) return;

        document.getElementById('stockin-item-id').value = item.id;
        document.getElementById('stockin-item-name').textContent = item.name;
        document.getElementById('stockin-current-qty').textContent = `${item.qty} ${item.unit || 'قطعة'}`;
        document.getElementById('stockin-add-qty').value = '10';
        document.getElementById('stockin-unit-cost').value = item.buyPrice;
        document.getElementById('stockin-supplier').value = '';

        window.app.openModal('stockin-modal');
    }

    submitStockIn(itemId, addedQty, newUnitCost, supplier) {
        if (!window.auth.isAdmin()) return;
        const qty = parseFloat(addedQty);
        if (isNaN(qty) || qty <= 0) {
            window.app.showToast('يرجى كتابة كمية صحيحة أكبر من الصفر', 'error');
            return;
        }

        const item = window.db.getItems().find(it => it.id === itemId);
        if (!item) return;

        const updateData = {
            qty: (parseFloat(item.qty) || 0) + qty
        };
        if (newUnitCost && parseFloat(newUnitCost) > 0) {
            updateData.buyPrice = parseFloat(newUnitCost);
        }

        window.db.updateItem(itemId, updateData);
        window.app.showToast(`تم توريد (${qty} ${item.unit || 'قطعة'}) إلى رصيد ${item.name}`, 'success');
        window.app.closeModal('stockin-modal');
        this.render();
    }

    getIconForCategory(catId) {
        const catMap = {
            drinks: 'fas fa-mug-hot',
            snacks: 'fas fa-cookie-bite',
            accessories: 'fas fa-headphones',
            spares: 'fas fa-tools',
            cards: 'fas fa-gamepad'
        };
        return catMap[catId] || 'fas fa-box';
    }
}

window.inventory = new InventoryManager();
