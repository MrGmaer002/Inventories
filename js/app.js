// ==========================================================================
// PanCafe Pro Inventory - Main Application Controller & UI Binder
// ==========================================================================

class AppController {
    constructor() {
        this.audioCtx = null;
    }

    init() {
        // Init Subsystems
        window.auth.applyRolePermissions();
        window.inventory.init();
        window.pos.init();

        // Start Live Clock
        this.startLiveClock();

        // Bind Global Events
        this.bindEvents();

        // Apply store name to titlebar
        const settings = window.db.getSettings();
        const brandEl = document.getElementById('brand-store-name');
        if (brandEl) brandEl.textContent = settings.storeName || 'مخازن';

        console.log("نظام مخازن - جاهز للعمل.");
    }

    // Live Clock & Shift Duration
    startLiveClock() {
        const clockEl = document.getElementById('live-clock');
        const updateClock = () => {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('ar-EG', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            });
            if (clockEl) clockEl.textContent = timeStr;
        };
        updateClock();
        setInterval(updateClock, 1000);
    }

    // Synthesized Sound Effects (No external mp3 required)
    playSound(type = 'click') {
        const settings = window.db.getSettings();
        if (settings.soundEnabled === false) return;

        try {
            if (!this.audioCtx) {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            if (this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }

            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.connect(gain);
            gain.connect(this.audioCtx.destination);

            const now = this.audioCtx.currentTime;

            if (type === 'click') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(600, now);
                osc.frequency.exponentialRampToValueAtTime(800, now + 0.05);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
                osc.start(now);
                osc.stop(now + 0.05);
            } else if (type === 'cash') {
                // Two pleasant chimes (cash register sound)
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(987.77, now); // B5
                osc.frequency.setValueAtTime(1318.51, now + 0.08); // E6
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
                osc.start(now);
                osc.stop(now + 0.35);
            }
        } catch (e) {
            console.log('Audio playback error', e);
        }
    }

    // Modal Manager
    openModal(modalId) {
        const overlay = document.getElementById(modalId);
        if (!overlay) return;

        // Ensure switch user modal always populates user cards
        if (modalId === 'login-modal' && !overlay.classList.contains('active')) {
            if (window.auth && typeof window.auth.openSwitchUserModal === 'function') {
                window.auth.openSwitchUserModal();
                return;
            }
        }

        overlay.classList.add('active');
        this.playSound('click');
    }

    closeModal(modalId) {
        const overlay = document.getElementById(modalId);
        if (overlay) {
            overlay.classList.remove('active');
        }
    }

    // Toast Notifications
    showToast(message, type = 'info') {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        let icon = 'fas fa-info-circle';
        if (type === 'success') icon = 'fas fa-check-circle';
        if (type === 'error') icon = 'fas fa-exclamation-circle';
        if (type === 'warning') icon = 'fas fa-bell';

        toast.innerHTML = `<i class="${icon}"></i><span>${message}</span>`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3200);
    }

    // Backup & Restore
    exportBackup() {
        const data = {
            version: '1.0',
            exportedAt: new Date().toISOString(),
            users: window.db.getUsers(),
            items: window.db.getItems(),
            sales: window.db.getSales(),
            settings: window.db.getSettings()
        };

        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `pancafe_inventory_backup_${getTodayDateString()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        this.showToast('تم تحميل النسخة الاحتياطية بنجاح', 'success');
    }

    importBackup(fileInput) {
        const file = fileInput.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (data.items && data.users) {
                    window.db.saveItems(data.items);
                    window.db.saveUsers(data.users);
                    if (data.sales) window.db.saveSales(data.sales);
                    if (data.settings) window.db.saveSettings(data.settings);

                    this.showToast('تم استعادة النسخة الاحتياطية بنجاح!', 'success');
                    setTimeout(() => window.location.reload(), 800);
                } else {
                    this.showToast('ملف النسخة الاحتياطية غير صالح', 'error');
                }
            } catch (err) {
                this.showToast('خطأ أثناء قراءة ملف النسخة الاحتياطية', 'error');
            }
        };
        reader.readAsText(file);
    }

    // Bind Event Handlers
    bindEvents() {
        // Search Input
        const searchInput = document.getElementById('search-items-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                window.inventory.setSearch(e.target.value);
            });
        }

        // View Mode Toggles
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                window.inventory.setView(btn.dataset.view);
            });
        });

        // Item Form Submit (Add / Edit)
        const itemForm = document.getElementById('item-form');
        if (itemForm) {
            itemForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const formData = {
                    id: document.getElementById('item-id-input').value,
                    name: document.getElementById('item-name-input').value,
                    category: document.getElementById('item-category-input').value,
                    barcode: document.getElementById('item-barcode-input').value,
                    buyPrice: document.getElementById('item-buy-price-input').value,
                    sellPrice: document.getElementById('item-sell-price-input').value,
                    qty: document.getElementById('item-qty-input').value,
                    minQty: document.getElementById('item-min-qty-input').value,
                    unit: document.getElementById('item-unit-input').value,
                    notes: document.getElementById('item-notes-input').value
                };
                window.inventory.saveItemFromForm(formData);
            });
        }

        // Stock In Form Submit
        const stockInForm = document.getElementById('stockin-form');
        if (stockInForm) {
            stockInForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const itemId = document.getElementById('stockin-item-id').value;
                const addQty = document.getElementById('stockin-add-qty').value;
                const unitCost = document.getElementById('stockin-unit-cost').value;
                const supplier = document.getElementById('stockin-supplier').value;
                window.inventory.submitStockIn(itemId, addQty, unitCost, supplier);
            });
        }

        // New User Form Submit
        const userForm = document.getElementById('new-user-form');
        if (userForm) {
            userForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const userData = {
                    fullName: document.getElementById('user-fullname-input').value,
                    username: document.getElementById('user-username-input').value,
                    password: document.getElementById('user-password-input').value,
                    role: document.getElementById('user-role-input').value,
                    phone: document.getElementById('user-phone-input').value,
                    avatar: document.getElementById('user-avatar-input').value || '🧑‍💻'
                };
                if (window.auth.createNewUser(userData)) {
                    userForm.reset();
                }
            });
        }

        // Login Switch Form Submit
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const user = document.getElementById('login-username').value;
                const pass = document.getElementById('login-password').value;
                const res = window.auth.login(user, pass);
                if (res.success) {
                    this.showToast(`مرحباً بك: ${res.user.fullName}`, 'success');
                    this.closeModal('login-modal');
                } else {
                    this.showToast(res.message, 'error');
                }
            });
        }

        // Lock Screen Unlock Form
        const lockForm = document.getElementById('lock-form');
        if (lockForm) {
            lockForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const pass = document.getElementById('lock-password').value;
                window.auth.unlockScreen(pass);
            });
        }

        // Settings Form Submit
        const settingsForm = document.getElementById('settings-form');
        if (settingsForm) {
            settingsForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const storeName = document.getElementById('setting-store-name').value;
                const currency = document.getElementById('setting-currency').value;
                const footer = document.getElementById('setting-footer').value;
                const sound = document.getElementById('setting-sound').checked;

                window.db.saveSettings({
                    storeName: storeName,
                    currency: currency,
                    receiptFooter: footer,
                    soundEnabled: sound
                });

                document.getElementById('brand-store-name').textContent = storeName;
                this.showToast('تم حفظ الإعدادات بنجاح', 'success');
                this.closeModal('settings-modal');
                window.inventory.render();
                window.pos.updateStatusBarTotals();
            });
        }

        // Discount & Paid Inputs in POS
        const discountInput = document.getElementById('pos-discount-input');
        if (discountInput) {
            discountInput.addEventListener('input', (e) => {
                window.pos.discountAmount = parseFloat(e.target.value) || 0;
                window.pos.renderCart();
            });
        }

        const paidInput = document.getElementById('pos-paid-input');
        if (paidInput) {
            paidInput.addEventListener('input', () => {
                window.pos.renderCart();
            });
        }

        // Admin Change Password Form Submit
        const changePassForm = document.getElementById('admin-change-password-form');
        if (changePassForm) {
            changePassForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const userId = document.getElementById('change-pw-user-id')?.value;
                const newPass = document.getElementById('change-pw-new-input')?.value;
                const confirmPass = document.getElementById('change-pw-confirm-input')?.value;
                if (userId && newPass) {
                    window.auth.changeUserPassword(userId, newPass, confirmPass);
                }
            });
        }
    }
}

// Global App Instance
window.app = new AppController();

// Boot on DOM Ready safely
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.app.init();
    });
} else {
    window.app.init();
}
