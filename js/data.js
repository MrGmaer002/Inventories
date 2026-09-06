// ==========================================================================
// PanCafe Pro Inventory - Data & Storage Layer
// ==========================================================================

const STORAGE_KEYS = {
    ITEMS: 'pancafe_inv_items_v1',
    USERS: 'pancafe_inv_users_v1',
    SALES: 'pancafe_inv_sales_v1',
    PURCHASES: 'pancafe_inv_purchases_v1',
    CURRENT_USER: 'pancafe_inv_curr_user_v1',
    SETTINGS: 'pancafe_inv_settings_v1',
    SHIFT: 'pancafe_inv_shift_v1',
    ACTIVE_SHIFT: 'pancafe_inv_shift_v1',
    SHIFTS_HISTORY: 'pancafe_inv_shifts_history_v1'
};

// Initial Seed Users (حساب المدير العام فقط - بدون موظفين تجريبيين)
const DEFAULT_USERS = [
    {
        id: 'usr_admin',
        username: 'admin',
        password: '123',
        fullName: 'المدير العام (Admin)',
        role: 'admin', // 'admin' | 'cashier'
        createdAt: '2026-01-01',
        avatar: '👨‍💼',
        phone: '01000000001'
    }
];

// Initial Categories
const DEFAULT_CATEGORIES = [
    { id: 'cat_all', name: 'كل الأصناف', icon: 'fas fa-boxes-stacked' },
    { id: 'drinks', name: 'المشروبات والعصائر', icon: 'fas fa-mug-hot' },
    { id: 'snacks', name: 'سناكس وتسالي', icon: 'fas fa-cookie-bite' },
    { id: 'accessories', name: 'إكسسوارات وسماعات', icon: 'fas fa-headphones' },
    { id: 'spares', name: 'قطع غيار وصيانة', icon: 'fas fa-tools' },
    { id: 'cards', name: 'كروت وألعاب', icon: 'fas fa-gamepad' },
    { id: 'general', name: 'صنف عام', icon: 'fas fa-box' }
];
window.DEFAULT_CATEGORIES = DEFAULT_CATEGORIES;

// Initial Seed Items (فارغ تماماً لبدء مخزن جديد ونظيف بدون بيانات وهمية)
const DEFAULT_ITEMS = [];

// Helper to get local date formatted YYYY-MM-DD
function getTodayDateString(date = new Date()) {
    const d = (date instanceof Date && !isNaN(date)) ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Helper to format 12-hour time strictly with ص / م
function formatTime12H(date = new Date(), withSeconds = false) {
    const d = (date instanceof Date && !isNaN(date)) ? date : new Date(date);
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    const period = hours >= 12 ? 'م' : 'ص';
    const hours12 = String(hours % 12 || 12).padStart(2, '0');
    if (withSeconds) {
        return `${hours12}:${minutes}:${seconds} ${period}`;
    }
    return `${hours12}:${minutes} ${period}`;
}
window.getTodayDateString = getTodayDateString;
window.formatTime12H = formatTime12H;

// Generate Initial Sales (يبدأ فارغ تماماً بدون مبيعات تجريبية)
function generateInitialSales() {
    return [];
}

// Data Store Class with LocalStorage persistence
class DataStore {
    constructor() {
        this.init();
    }

    init() {
        if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
            localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(DEFAULT_USERS));
        }
        if (!localStorage.getItem(STORAGE_KEYS.ITEMS)) {
            localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify([]));
        }
        if (!localStorage.getItem(STORAGE_KEYS.SALES)) {
            localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify([]));
        }
        if (!localStorage.getItem(STORAGE_KEYS.PURCHASES)) {
            localStorage.setItem(STORAGE_KEYS.PURCHASES, JSON.stringify([]));
        }
        if (!localStorage.getItem(STORAGE_KEYS.CURRENT_USER)) {
            localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(DEFAULT_USERS[0]));
        }
        if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
            localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({
                storeName: 'مخازن',
                currency: 'ج.م',
                soundEnabled: true,
                autoPrint: false,
                receiptFooter: 'شكراً لتعاملكم معنا - نظام مخازن'
            }));
        } else {
            // Update legacy storeName if still 'مخزن وصالة PanCafe Pro'
            try {
                const s = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS));
                if (s && (s.storeName === 'مخزن وصالة PanCafe Pro' || !s.storeName)) {
                    s.storeName = 'مخازن';
                    if (s.receiptFooter && s.receiptFooter.includes('PanCafe Pro')) {
                        s.receiptFooter = 'شكراً لتعاملكم معنا - نظام مخازن';
                    }
                    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(s));
                }
            } catch (e) {}
        }

        // Clean up any legacy or corrupt shifts storage in user's browser
        try {
            if (localStorage.getItem('undefined')) {
                localStorage.removeItem('undefined');
            }
            const historyRaw = localStorage.getItem(STORAGE_KEYS.SHIFTS_HISTORY);
            if (!historyRaw || !Array.isArray(JSON.parse(historyRaw))) {
                localStorage.setItem(STORAGE_KEYS.SHIFTS_HISTORY, JSON.stringify([]));
            }
        } catch (e) {
            localStorage.setItem(STORAGE_KEYS.SHIFTS_HISTORY, JSON.stringify([]));
        }

        // Clean-slate migration: If browser currently has the old pre-seeded demo items (BOX-01 to BOX-12),
        // clear them so the user starts with a completely fresh, empty warehouse as requested.
        try {
            if (!localStorage.getItem('pancafe_clean_warehouse_v1')) {
                localStorage.setItem('pancafe_clean_warehouse_v1', 'true');
                const existingItems = this.getItems();
                const isOnlyDemoItems = existingItems.length > 0 && existingItems.every(it => it.id && it.id.startsWith('itm_0'));
                if (isOnlyDemoItems) {
                    this.saveItems([]);
                    this.saveSales([]);
                    this.savePurchases([]);
                }
            }
        } catch (e) {}

        // Clean-slate migration for users: Remove only demo cashiers (ahmed, mahmoud), never remove custom cashiers created by user
        try {
            if (!localStorage.getItem('pancafe_clean_users_admin_only_v4')) {
                localStorage.setItem('pancafe_clean_users_admin_only_v4', 'true');
                let users = this.getUsers();
                // Remove only the hardcoded initial demo cashiers
                users = users.filter(u => u.id !== 'usr_cashier1' && u.id !== 'usr_cashier2');
                if (!users.some(u => u.role === 'admin' || u.id === 'usr_admin')) {
                    users.unshift(DEFAULT_USERS[0]);
                }
                this.saveUsers(users);
                // Ensure active logged-in user is valid
                const curr = this.getCurrentUser();
                if (!curr || !users.some(u => u.id === curr.id)) {
                    this.setCurrentUser(users.find(u => u.role === 'admin') || DEFAULT_USERS[0]);
                }
            }
        } catch (e) {}
    }

    clearWarehouseItems() {
        this.saveItems([]);
        this.saveSales([]);
        this.savePurchases([]);
        return true;
    }

    resetAllData() {
        localStorage.removeItem(STORAGE_KEYS.ITEMS);
        localStorage.removeItem(STORAGE_KEYS.SALES);
        localStorage.removeItem(STORAGE_KEYS.PURCHASES);
        localStorage.removeItem(STORAGE_KEYS.SHIFT);
        localStorage.removeItem(STORAGE_KEYS.ACTIVE_SHIFT);
        localStorage.removeItem(STORAGE_KEYS.SHIFTS_HISTORY);
        localStorage.removeItem(STORAGE_KEYS.USERS);
        localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
        this.init();
    }

    // Items
    getItems() {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.ITEMS);
            if (!raw) return [];
            const data = JSON.parse(raw);
            return Array.isArray(data) ? data : [];
        } catch (e) {
            return [];
        }
    }

    saveItems(items) {
        const safeItems = Array.isArray(items) ? items : [];
        localStorage.setItem(STORAGE_KEYS.ITEMS, JSON.stringify(safeItems));
    }

    addItem(item) {
        const items = this.getItems();
        item.id = 'itm_' + Date.now();
        item.code = 'BOX-' + (items.length + 1).toString().padStart(2, '0');
        items.unshift(item);
        this.saveItems(items);
        return item;
    }

    updateItem(id, updatedData) {
        const items = this.getItems();
        const index = items.findIndex(it => it.id === id);
        if (index !== -1) {
            items[index] = { ...items[index], ...updatedData };
            this.saveItems(items);
            return items[index];
        }
        return null;
    }

    deleteItem(id) {
        let items = this.getItems();
        items = items.filter(it => it.id !== id);
        this.saveItems(items);
    }

    adjustItemStock(id, changeQty, reason = 'sale') {
        const items = this.getItems();
        const item = items.find(it => it.id === id);
        if (item) {
            item.qty = Math.max(0, (parseFloat(item.qty) || 0) + parseFloat(changeQty));
            this.saveItems(items);
            return item;
        }
        return null;
    }

    // Users
    getUsers() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS)) || DEFAULT_USERS;
        } catch (e) {
            return DEFAULT_USERS;
        }
    }

    saveUsers(users) {
        localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    }

    addUser(user) {
        const users = this.getUsers();
        user.id = 'usr_' + Date.now();
        user.createdAt = getTodayDateString();
        users.push(user);
        this.saveUsers(users);
        return user;
    }

    updateUser(id, data) {
        const users = this.getUsers();
        const idx = users.findIndex(u => u.id === id);
        if (idx !== -1) {
            users[idx] = { ...users[idx], ...data };
            this.saveUsers(users);
            return users[idx];
        }
        return null;
    }

    deleteUser(id) {
        let users = this.getUsers();
        users = users.filter(u => u.id !== id);
        this.saveUsers(users);
    }

    // Auth & Session
    getCurrentUser() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.CURRENT_USER)) || DEFAULT_USERS[0];
        } catch (e) {
            return DEFAULT_USERS[0];
        }
    }

    setCurrentUser(user) {
        localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    }

    // Shifts Lifecycle Management
    getActiveShift() {
        try {
            const shift = JSON.parse(localStorage.getItem(STORAGE_KEYS.ACTIVE_SHIFT));
            if (shift && shift.status === 'active') {
                return shift;
            }
        } catch (e) {}

        // If no active shift exists, initialize one
        return this.startNewShift();
    }

    startNewShift(initialCash = 0) {
        const history = this.getShiftsHistory();
        const nextShiftNum = history.length + 1;
        const currentUser = this.getCurrentUser();
        const d = new Date();

        const newShift = {
            id: 'SH-' + (100 + nextShiftNum),
            shiftNumber: nextShiftNum,
            status: 'active',
            startTime: Date.now(),
            startDate: getTodayDateString(d),
            startTimeFormatted: formatTime12H(d),
            cashierId: currentUser.id,
            cashierName: currentUser.fullName,
            initialCash: parseFloat(initialCash) || 0
        };

        localStorage.setItem(STORAGE_KEYS.ACTIVE_SHIFT, JSON.stringify(newShift));
        return newShift;
    }

    getShiftsHistory() {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.SHIFTS_HISTORY);
            if (!raw) return [];
            const data = JSON.parse(raw);
            return Array.isArray(data) ? data : [];
        } catch (e) {
            return [];
        }
    }

    saveShiftsHistory(history) {
        const safeArr = Array.isArray(history) ? history : [];
        localStorage.setItem(STORAGE_KEYS.SHIFTS_HISTORY, JSON.stringify(safeArr));
    }

    closeActiveShift(notes = '', auditData = null) {
        const activeShift = this.getActiveShift();
        const sales = this.getSalesForShift(activeShift.id);
        const totalCash = sales.reduce((sum, s) => sum + parseFloat(s.total), 0);
        const totalInvoices = sales.length;
        const d = new Date();

        // Calculate total cost, profit, and itemized breakdown
        let totalCost = 0;
        let totalItemsQty = 0;
        const itemsMap = {};
        sales.forEach(s => {
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

        // Financial and Payment calculations
        let totalDiscounts = 0;
        let cashSales = 0;
        let transferSales = 0;
        const discountedSales = [];

        sales.forEach(s => {
            const saleTotal = parseFloat(s.total) || 0;
            const saleDiscount = parseFloat(s.discount) || 0;
            totalDiscounts += saleDiscount;

            if (saleDiscount > 0) {
                discountedSales.push({
                    id: s.id,
                    customer: s.customer || 'عميل نقدي',
                    discount: saleDiscount,
                    reason: s.discountReason || '',
                    total: saleTotal
                });
            }

            if (s.paymentMethod === 'transfer') {
                transferSales += saleTotal;
            } else {
                cashSales += saleTotal;
            }
        });

        const currentUser = this.getCurrentUser();
        const actualCashVal = (auditData && auditData.actualCash !== undefined && auditData.actualCash !== null)
            ? parseFloat(auditData.actualCash)
            : totalCash;
        const shortageVal = (auditData && auditData.shortage) ? parseFloat(auditData.shortage) : 0;
        const surplusVal = (auditData && auditData.surplus) ? parseFloat(auditData.surplus) : 0;
        const diffVal = (auditData && auditData.diff !== undefined) ? parseFloat(auditData.diff) : 0;

        const closedRecord = {
            ...activeShift,
            status: 'closed',
            endTime: Date.now(),
            endDate: getTodayDateString(d),
            endTimeFormatted: formatTime12H(d),
            totalSalesCash: totalCash,
            expectedCash: totalCash,
            cashSales: cashSales,
            transferSales: transferSales,
            totalDiscounts: totalDiscounts,
            discountedSales: discountedSales,
            discountedInvoicesCount: discountedSales.length,
            actualCash: actualCashVal,
            shortage: shortageVal,
            surplus: surplusVal,
            discrepancy: diffVal,
            totalInvoices: totalInvoices,
            totalItemsQty: totalItemsQty,
            totalCost: totalCost,
            netProfit: totalCash - totalCost,
            itemsBreakdown: Object.values(itemsMap),
            closedBy: currentUser ? currentUser.fullName : (activeShift.cashierName || 'المسؤول'),
            salesIds: sales.map(s => s.id),
            notes: notes
        };

        // Archive into history
        const history = this.getShiftsHistory();
        history.unshift(closedRecord);
        this.saveShiftsHistory(history);

        // Immediately start a brand new fresh active shift with 0 EGP!
        const brandNewShift = this.startNewShift();

        return { closedShift: closedRecord, newShift: brandNewShift };
    }

    getShiftById(shiftId) {
        if (!shiftId) return null;
        const active = this.getActiveShift();
        if (active.id === shiftId) return active;
        const history = this.getShiftsHistory();
        return history.find(s => s.id === shiftId) || null;
    }

    getSalesForShift(shiftId) {
        const sales = this.getSales();
        return sales.filter(s => s.shiftId === shiftId);
    }

    getSalesForActiveShift() {
        const activeShift = this.getActiveShift();
        return this.getSalesForShift(activeShift.id);
    }

    // Sales & Invoices
    getSales() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.SALES)) || [];
        } catch (e) {
            return [];
        }
    }

    saveSales(sales) {
        localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(sales));
    }

    addSale(sale) {
        const sales = this.getSales();
        const activeShift = this.getActiveShift();
        const nextId = 'INV-' + (1000 + sales.length + 1);
        
        sale.id = nextId;
        sale.shiftId = activeShift.id;
        sale.timestamp = Date.now();
        const d = new Date();
        sale.date = getTodayDateString(d);
        sale.time = formatTime12H(d);
        
        // Deduct inventory quantities
        sale.items.forEach(soldItem => {
            this.adjustItemStock(soldItem.itemId, -parseFloat(soldItem.qty), 'sale');
        });

        sales.unshift(sale);
        this.saveSales(sales);
        return sale;
    }

    // Settings
    getSettings() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS)) || {};
        } catch (e) {
            return {};
        }
    }

    saveSettings(settings) {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    }

    // Reset to defaults
    resetAllData() {
        localStorage.clear();
        this.init();
    }
}

// Global instance
window.db = new DataStore();
