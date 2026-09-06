// ==========================================================================
// PanCafe Pro Inventory - Auth & User Roles Manager
// ==========================================================================

class AuthManager {
    constructor() {
        this.currentUser = window.db.getCurrentUser();
        this.isLocked = false;
        this.shiftStartTime = Date.now();
        this.selectedSwitchUserId = null;
    }

    login(username, password) {
        const users = window.db.getUsers();
        const user = users.find(u => u.username.toLowerCase() === username.toLowerCase().trim());

        if (!user) {
            return { success: false, message: 'اسم المستخدم غير موجود' };
        }

        if (user.password !== password) {
            return { success: false, message: 'كلمة المرور غير صحيحة' };
        }

        // Prevent switching to another user if current active shift has unclosed sales
        const sales = window.db.getSalesForActiveShift();
        if (this.currentUser && this.currentUser.id !== user.id && sales.length > 0) {
            return {
                success: false,
                message: 'عفواً! مينفعش تبدل الوردية أو المستخدم غير لما تقفل الوردية الحالية وتصفر الدرج أولاً!'
            };
        }

        this.currentUser = user;
        window.db.setCurrentUser(user);
        this.shiftStartTime = Date.now();
        this.applyRolePermissions();
        return { success: true, user };
    }

    logout() {
        this.handleSwitchShiftClick();
    }

    lockScreen() {
        this.isLocked = true;
        const lockOverlay = document.getElementById('lock-screen');
        const lockUserAvatar = document.getElementById('lock-user-avatar');
        const lockUserName = document.getElementById('lock-user-name');
        const lockPassInput = document.getElementById('lock-password');

        if (lockOverlay) {
            if (lockUserAvatar) lockUserAvatar.textContent = this.currentUser.avatar || '👤';
            if (lockUserName) lockUserName.textContent = this.currentUser.fullName;
            if (lockPassInput) {
                lockPassInput.value = '';
                lockPassInput.type = 'password';
            }
            lockOverlay.classList.add('active');
            setTimeout(() => { if (lockPassInput) lockPassInput.focus(); }, 120);
        }
    }

    unlockScreen(password) {
        const correctPassword = this.currentUser ? this.currentUser.password : '123';
        if (password === correctPassword) {
            this.isLocked = false;
            document.getElementById('lock-screen').classList.remove('active');
            window.app.showToast('تم إلغاء قفل الشاشة بنجاح', 'success');
            return true;
        } else {
            window.app.showToast('كلمة المرور غير صحيحة!', 'error');
            return false;
        }
    }

    isAdmin() {
        return this.currentUser && this.currentUser.role === 'admin';
    }

    isCashier() {
        return this.currentUser && this.currentUser.role === 'cashier';
    }

    applyRolePermissions() {
        const isAdmin = this.isAdmin();

        // Update user badge in top bar
        const nameEl = document.getElementById('current-user-name');
        const roleEl = document.getElementById('current-user-role');
        const avatarEl = document.getElementById('current-user-avatar');

        if (nameEl) nameEl.textContent = this.currentUser.fullName;
        if (avatarEl) avatarEl.textContent = this.currentUser.avatar || '👤';
        if (roleEl) {
            roleEl.textContent = isAdmin ? 'المدير العام' : 'كاشير / موظف';
            roleEl.className = `role-tag ${this.currentUser.role}`;
        }

        // Show/Hide Admin Only Controls
        const adminElements = document.querySelectorAll('.admin-only');
        adminElements.forEach(el => {
            if (isAdmin) {
                el.style.display = '';
                el.removeAttribute('disabled');
                el.classList.remove('disabled');
            } else {
                el.style.display = 'none';
                el.setAttribute('disabled', 'true');
                el.classList.add('disabled');
            }
        });

        // Update bottom status bar cashier info
        const statusCashier = document.getElementById('status-bar-cashier');
        if (statusCashier) {
            statusCashier.textContent = this.currentUser.fullName;
        }

        // Re-render inventory to show/hide admin buttons (edit, delete, cost price)
        if (window.inventory) {
            window.inventory.render();
        }

        // Update today's figures in status bar
        if (window.pos) {
            window.pos.updateStatusBarTotals();
        }
    }

    // ==========================================================================
    // Switch Shift & Switch User Protection
    // ==========================================================================
    handleSwitchShiftClick() {
        const sales = window.db.getSalesForActiveShift();
        const activeShift = window.db.getActiveShift();
        const settings = window.db.getSettings();
        const currency = settings.currency || 'ج.م';

        // If current active shift has unclosed sales, block handover until closed
        if (sales && sales.length > 0) {
            const totalCash = sales.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
            const totalDiscounts = sales.reduce((sum, s) => sum + (parseFloat(s.discount) || 0), 0);
            const statsContainer = document.getElementById('must-close-shift-stats');

            if (statsContainer) {
                statsContainer.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; color: var(--text-secondary);">
                        <span>رقم الوردية الحالية:</span>
                        <strong style="color: var(--primary-cyan);">وردية #${activeShift ? activeShift.shiftNumber : 1}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; color: var(--text-secondary);">
                        <span>المسؤول الحالي عن الشيفت:</span>
                        <strong style="color: #fff;">${this.currentUser ? this.currentUser.fullName : 'المسؤول'}</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; color: var(--text-secondary);">
                        <span>عدد الفواتير المسجلة:</span>
                        <strong style="color: #ffbb33;">${sales.length} عملية بيع</strong>
                    </div>
                    ${totalDiscounts > 0 ? `
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; color: #ff8a80;">
                            <span>إجمالي الخصومات بالوردية:</span>
                            <strong>-${totalDiscounts.toFixed(2)} ${currency}</strong>
                        </div>
                    ` : ''}
                    <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px dashed #364259; font-size: 14px;">
                        <span style="font-weight: bold; color: #fff;">إجمالي الفلوس بالدرج والتحويل:</span>
                        <strong style="color: var(--status-green); font-size: 16px; font-family: var(--font-mono);">${totalCash.toFixed(2)} ${currency}</strong>
                    </div>
                `;
            }

            window.app.openModal('must-close-shift-modal');
            window.app.playSound('warning');
            return;
        }

        // If no sales in active shift, allow user picker directly
        this.openSwitchUserModal();
    }

    proceedToCloseShiftFromAlert() {
        window.app.closeModal('must-close-shift-modal');
        setTimeout(() => {
            window.reports.openSecureCloseShiftModal();
        }, 150);
    }

    // ==========================================================================
    // Switch User Menu & Picker Modal
    // ==========================================================================
    openSwitchUserModal(targetUserId = null, bypassShiftCheck = false) {
        if (!bypassShiftCheck) {
            const sales = window.db.getSalesForActiveShift();
            if (sales && sales.length > 0) {
                this.handleSwitchShiftClick();
                return;
            }
        }

        const users = window.db.getUsers();
        const container = document.getElementById('switch-user-cards-container');
        const hintEl = document.getElementById('switch-users-count-hint');
        const passInput = document.getElementById('login-password');

        if (hintEl) {
            hintEl.textContent = `(${users.length} حساب مسجل)`;
        }

        if (container) {
            container.innerHTML = users.map(user => {
                const isCurrent = this.currentUser && this.currentUser.id === user.id;
                const roleName = user.role === 'admin' ? 'مدير عام' : 'كاشير';
                return `
                    <div class="switch-user-card" id="user-card-${user.id}" onclick="window.auth.selectSwitchUser('${user.id}')" title="انقر لاختيار ${user.fullName}">
                        <div class="active-check-badge"><i class="fas fa-check"></i></div>
                        ${isCurrent ? '<span class="current-account-tag">الحالي</span>' : ''}
                        <div class="card-avatar">${user.avatar || '👤'}</div>
                        <div class="card-fullname">${user.fullName}</div>
                        <div class="card-username">@${user.username}</div>
                        <span class="role-tag ${user.role}" style="font-size: 10px; padding: 2px 6px;">${roleName}</span>
                    </div>
                `;
            }).join('');
        }

        // Reset password input
        if (passInput) {
            passInput.value = '';
            passInput.type = 'password';
        }

        // Determine which user to pre-select
        let preSelectId = targetUserId;
        if (!preSelectId) {
            const otherUser = users.find(u => !this.currentUser || u.id !== this.currentUser.id);
            preSelectId = otherUser ? otherUser.id : (this.currentUser ? this.currentUser.id : users[0]?.id);
        }

        if (preSelectId) {
            this.selectSwitchUser(preSelectId);
        }

        const overlay = document.getElementById('login-modal');
        if (overlay) {
            overlay.classList.add('active');
            window.app.playSound('click');
        }

        setTimeout(() => {
            if (passInput) passInput.focus();
        }, 150);
    }

    selectSwitchUser(userId) {
        const users = window.db.getUsers();
        const user = users.find(u => u.id === userId);
        if (!user) return;

        this.selectedSwitchUserId = user.id;

        // Update card active styles
        document.querySelectorAll('.switch-user-card').forEach(card => card.classList.remove('active'));
        const selectedCard = document.getElementById(`user-card-${user.id}`);
        if (selectedCard) selectedCard.classList.add('active');

        // Update hidden username input
        const userHiddenInput = document.getElementById('login-username');
        if (userHiddenInput) userHiddenInput.value = user.username;

        // Update preview banner
        const previewEl = document.getElementById('login-selected-preview');
        const avatarEl = document.getElementById('login-preview-avatar');
        const nameEl = document.getElementById('login-preview-name');
        const subEl = document.getElementById('login-preview-sub');

        if (previewEl) {
            if (avatarEl) avatarEl.textContent = user.avatar || '👤';
            if (nameEl) nameEl.textContent = user.fullName;
            if (subEl) {
                const roleText = user.role === 'admin' ? 'مدير عام (تحكم كامل)' : 'كاشير (مبيعات ويومية)';
                subEl.textContent = `${roleText} • اسم الدخول: @${user.username}`;
            }
            previewEl.style.display = 'flex';
        }

        // Focus password
        const passInput = document.getElementById('login-password');
        if (passInput) {
            passInput.value = '';
            passInput.focus();
        }
    }

    // Toggle password visibility for any input
    togglePasswordVisibility(inputId, btnEl) {
        const input = document.getElementById(inputId);
        if (!input) return;

        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';

        if (btnEl) {
            const icon = btnEl.querySelector('i');
            if (icon) {
                icon.className = isPassword ? 'fas fa-eye-slash' : 'fas fa-eye';
            }
        }
    }

    // ==========================================================================
    // Admin Password Change Modal & Logic (تغيير كلمة مرور المستخدمين)
    // ==========================================================================
    openChangePasswordModal(userId) {
        if (!this.isAdmin()) {
            window.app.showToast('عفواً، خاصية تغيير كلمات المرور مفعلة للمدير العام فقط!', 'error');
            return;
        }

        const users = window.db.getUsers();
        const user = users.find(u => u.id === userId);
        if (!user) {
            window.app.showToast('المستخدم غير موجود بالنظام', 'error');
            return;
        }

        const userIdInput = document.getElementById('change-pw-user-id');
        const avatarEl = document.getElementById('change-pw-avatar');
        const nameEl = document.getElementById('change-pw-name');
        const usernameEl = document.getElementById('change-pw-username');
        const roleEl = document.getElementById('change-pw-role');
        const newPassInput = document.getElementById('change-pw-new-input');
        const confirmPassInput = document.getElementById('change-pw-confirm-input');

        if (userIdInput) userIdInput.value = user.id;
        if (avatarEl) avatarEl.textContent = user.avatar || '👤';
        if (nameEl) nameEl.textContent = user.fullName;
        if (usernameEl) usernameEl.textContent = user.username;
        if (roleEl) {
            roleEl.textContent = user.role === 'admin' ? 'مدير عام' : 'كاشير';
            roleEl.className = `role-tag ${user.role}`;
        }

        // Clear password fields and reset mask
        if (newPassInput) {
            newPassInput.value = '';
            newPassInput.type = 'password';
        }
        if (confirmPassInput) {
            confirmPassInput.value = '';
            confirmPassInput.type = 'password';
        }

        // Reset any eye icons
        document.querySelectorAll('#change-password-modal .btn-toggle-password i').forEach(icon => {
            icon.className = 'fas fa-eye';
        });

        window.app.openModal('change-password-modal');
        setTimeout(() => {
            if (newPassInput) newPassInput.focus();
        }, 150);
    }

    changeUserPassword(userId, newPassword, confirmPassword) {
        if (!this.isAdmin()) {
            window.app.showToast('عفواً، المدير فقط يملك صلاحية تغيير كلمات المرور!', 'error');
            return false;
        }

        if (!newPassword || newPassword.trim() === '') {
            window.app.showToast('يرجى كتابة كلمة المرور الجديدة', 'warning');
            return false;
        }

        if (newPassword !== confirmPassword) {
            window.app.showToast('كلمتا المرور غير متطابقتين! تأكد من كتابتهما بشكل صحيح.', 'error');
            return false;
        }

        const updated = window.db.updateUser(userId, { password: newPassword });
        if (!updated) {
            window.app.showToast('تعذر العثور على المستخدم المطلوب تحديثه!', 'error');
            return false;
        }

        // If updated user is the currently logged in user, update session
        if (this.currentUser && this.currentUser.id === userId) {
            this.currentUser = updated;
            window.db.setCurrentUser(updated);
        }

        window.app.showToast(`تم بنجاح تغيير كلمة المرور للمستخدم (${updated.fullName})`, 'success');
        window.app.closeModal('change-password-modal');
        return true;
    }

    // ==========================================================================
    // Admin User CRUD
    // ==========================================================================
    createNewUser(userData) {
        if (!this.isAdmin()) {
            window.app.showToast('عفواً، المدير فقط يمكنه إضافة مستخدمين جدد!', 'error');
            return false;
        }

        const fullName = (userData.fullName || '').trim();
        const username = (userData.username || '').trim().toLowerCase();
        const password = (userData.password || '').trim();

        if (!fullName || !username || !password) {
            window.app.showToast('يرجى ملء جميع الحقول المطلوبة (الاسم، اسم الدخول، كلمة المرور)', 'warning');
            return false;
        }

        const users = window.db.getUsers();
        if (users.some(u => (u.username || '').toLowerCase() === username)) {
            window.app.showToast('اسم المستخدم مسجل مسبقاً، اختر اسماً آخر', 'error');
            return false;
        }

        const cleanUserData = {
            ...userData,
            fullName,
            username,
            password
        };

        window.db.addUser(cleanUserData);
        window.app.showToast(`تم إنشاء حساب ${fullName} بنجاح`, 'success');
        this.renderUsersList();
        return true;
    }

    deleteUser(userId) {
        if (!this.isAdmin()) return;
        if (userId === this.currentUser.id) {
            window.app.showToast('لا يمكنك حذف حسابك الحالي أثناء تسجيل الدخول به!', 'error');
            return;
        }

        if (confirm('هل أنت متأكد من حذف هذا المستخدم نهائياً من النظام؟')) {
            window.db.deleteUser(userId);
            window.app.showToast('تم حذف المستخدم بنجاح', 'success');
            this.renderUsersList();
        }
    }

    renderUsersList() {
        const container = document.getElementById('users-table-body');
        if (!container) return;

        const users = window.db.getUsers();
        container.innerHTML = users.map(user => `
            <tr>
                <td><span style="font-size: 18px;">${user.avatar || '👤'}</span> <strong>${user.fullName}</strong></td>
                <td><code style="color: var(--primary-cyan); font-weight: bold;">${user.username}</code></td>
                <td>
                    <span class="role-tag ${user.role}">
                        ${user.role === 'admin' ? 'مدير عام (تحكم كامل)' : 'كاشير (مبيعات ويومية)'}
                    </span>
                </td>
                <td>${user.phone || '-'}</td>
                <td>${user.createdAt || '-'}</td>
                <td>
                    <div style="display: flex; gap: 6px; align-items: center;">
                        <button type="button" class="btn btn-sm" style="background: rgba(255, 145, 0, 0.15); border: 1px solid rgba(255, 145, 0, 0.45); color: #ffbb33; padding: 4px 10px; font-size: 11px; border-radius: 4px; font-weight: bold;" onclick="window.auth.openChangePasswordModal('${user.id}')" title="تغيير كلمة المرور لهذا المستخدم">
                            <i class="fas fa-key"></i> <span>تغيير الباسورد</span>
                        </button>
                        ${user.id !== this.currentUser.id ? `
                            <button type="button" class="win-btn close" style="height: 28px; width: 28px; font-size: 11px;" onclick="window.auth.deleteUser('${user.id}')" title="حذف المستخدم">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        ` : '<span style="color: var(--text-muted); font-size: 11px; margin-right: 4px;">(حسابك الحالي)</span>'}
                    </div>
                </td>
            </tr>
        `).join('');
    }
}

window.auth = new AuthManager();
