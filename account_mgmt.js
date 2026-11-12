/**
 * Quản lý Giao diện Tài khoản & Phân quyền Admin
 * VMO Đà Nẵng 2026 - 2027
 */
function initAccountMgmt() {
  // 1. Kiểm tra xác thực ngay khi trang load
  const session = VMOAuth.requireAuth('login.html');
  if (!session) return;

  const currentUserNameEl = document.getElementById('currentUserName');
  const currentUserRoleEl = document.getElementById('currentUserRole');
  const btnOpenUserMgmt = document.getElementById('btnOpenUserMgmt');
  const btnLogout = document.getElementById('btnLogout');
  const modalOverlay = document.getElementById('accountMgmtModal');
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  const usersTableBody = document.getElementById('usersTableBody');
  const addUserForm = document.getElementById('addUserForm');
  const modalAlert = document.getElementById('modalAlert');
  const totalUsersCount = document.getElementById('totalUsersCount');
  const adminUsersCount = document.getElementById('adminUsersCount');

  const newLevels = document.getElementById('newEducationLevels');
  const newRole = document.getElementById('newRole');
  function syncNewLevelControl() { if (newLevels) { newLevels.disabled = newRole?.value === 'admin';newLevels.title = newRole?.value === 'admin' ? 'Admin có toàn quyền các cấp học' : ''; } }
  newRole?.addEventListener('change', syncNewLevelControl);syncNewLevelControl();

  // 2. Hiển thị thông tin người dùng lên thanh điều hướng
  const userAvatarContainer = document.getElementById('userAvatarContainer');
  if (userAvatarContainer) {
    if (session.photoURL) {
      userAvatarContainer.innerHTML = `<img src="${session.photoURL}" alt="${session.name || 'User'}" class="user-avatar-img" referrerpolicy="no-referrer">`;
    } else {
      userAvatarContainer.innerHTML = `<span>👤</span>`;
    }
  }

  if (currentUserNameEl) {
    currentUserNameEl.textContent = session.name || session.username;
  }
  if (currentUserRoleEl) {
    const isAdmin = session.role === 'admin';
    const isEn = (window.currentLang === 'en');
    currentUserRoleEl.textContent = isAdmin ? 'Admin' : session.role === 'teacher' ? (isEn ? 'Teacher' : 'Giáo viên') : (isEn ? 'Member' : 'Thành viên');
    currentUserRoleEl.className = 'user-role-badge ' + (isAdmin ? 'role-admin' : session.role === 'teacher' ? 'role-teacher' : 'role-user');
  }

  // Lắng nghe sự kiện đổi ngôn ngữ để cập nhật vai trò người dùng trên thanh điều hướng
  window.addEventListener('langchange', (e) => {
    const isEn = (e.detail?.lang === 'en');
    if (currentUserRoleEl) {
      const isAdmin = session.role === 'admin';
      currentUserRoleEl.textContent = isAdmin ? 'Admin' : session.role === 'teacher' ? (isEn ? 'Teacher' : 'Giáo viên') : (isEn ? 'Member' : 'Thành viên');
    }
    if (modalOverlay && modalOverlay.classList.contains('active')) {
      renderUsers();
    }
  });

  // Nếu không phải Admin thì ẩn nút "Quản lý tài khoản"
  if (btnOpenUserMgmt) {
    if (session.role !== 'admin') {
      btnOpenUserMgmt.style.display = 'none';
    } else {
      btnOpenUserMgmt.style.display = 'inline-flex';
    }
  }

  // 3. Xử lý Đăng xuất ngay lập tức, không dùng confirm() vì trình duyệt/iframe chặn
  if (btnLogout) {
    btnLogout.addEventListener('click', async (e) => {
      e.preventDefault();
      btnLogout.style.opacity = '0.75';
      btnLogout.innerHTML = '<span>⏳ Đang đăng xuất...</span>';
      await VMOAuth.logout('user_action');
    });
  }

  // 4. Mở / Đóng Modal Quản lý Tài khoản
  function openModal() {
    if (session.role !== 'admin') {
      return;
    }
    renderUsers();
    hideAlert();
    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  if (btnOpenUserMgmt) {
    btnOpenUserMgmt.addEventListener('click', openModal);
  }
  if (modalCloseBtn) {
    modalCloseBtn.addEventListener('click', closeModal);
  }

  // Đóng modal khi click ra ngoài vùng card
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        closeModal();
      }
    });
  }

  // 5. Hiển thị thông báo trong Modal
  function showAlert(msg, isSuccess = true) {
    if (!modalAlert) return;
    modalAlert.textContent = msg;
    modalAlert.className = 'vmo-alert-box ' + (isSuccess ? 'vmo-alert-success' : 'vmo-alert-error');
    modalAlert.style.display = 'block';
  }

  function hideAlert() {
    if (!modalAlert) return;
    modalAlert.style.display = 'none';
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function requestNewPassword(targetUsername) {
    return new Promise((resolve) => {
      const dialog = document.createElement('dialog');
      dialog.style.cssText = 'border:0;border-radius:14px;padding:0;max-width:420px;width:calc(100% - 32px);box-shadow:0 24px 60px rgba(15,23,42,.35);';
      dialog.innerHTML = `
        <form method="dialog" style="padding:24px;display:flex;flex-direction:column;gap:14px;">
          <h3 style="margin:0;color:#0f172a;font-size:1.05rem;"></h3>
          <label style="font-size:.86rem;font-weight:600;color:#334155;">Mật khẩu mới (tối thiểu 8 ký tự)</label>
          <input type="password" minlength="8" maxlength="128" required autocomplete="new-password"
            style="padding:11px 12px;border:1px solid #cbd5e1;border-radius:8px;font:inherit;">
          <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:4px;">
            <button type="button" data-action="cancel" style="padding:9px 14px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;cursor:pointer;">Hủy</button>
            <button type="submit" style="padding:9px 14px;border:0;border-radius:8px;background:#1d4ed8;color:#fff;font-weight:700;cursor:pointer;">Cập nhật</button>
          </div>
        </form>`;
      dialog.querySelector('h3').textContent = `Đổi mật khẩu: ${targetUsername}`;
      const form = dialog.querySelector('form');
      const input = dialog.querySelector('input');
      const finish = (value) => {
        if (dialog.open) dialog.close();
        dialog.remove();
        resolve(value);
      };
      dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => finish(null));
      dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        finish(null);
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        finish(input.value);
      });
      document.body.appendChild(dialog);
      dialog.showModal();
      input.focus();
    });
  }

  // 6. Tải và hiển thị danh sách người dùng từ MongoDB
  async function renderUsers() {
    if (!usersTableBody) return;
    usersTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#64748b;">Đang tải dữ liệu cơ sở dữ liệu...</td></tr>';
    const result = await VMOAuth.listUsers();
    if (!result.success) {
      usersTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#b91c1c;">Không thể tải danh sách tài khoản.</td></tr>';
      showAlert(result.message, false);
      return;
    }
    const users = Array.isArray(result.users) ? result.users : [];

    if (totalUsersCount) totalUsersCount.textContent = users.length;
    if (adminUsersCount) {
      const admins = users.filter(u => u.role === 'admin').length;
      adminUsersCount.textContent = admins;
    }

    usersTableBody.innerHTML = '';
    const isEn = (window.currentLang === 'en');

    users.forEach((u, idx) => {
      const isCurrent = u.username.toLowerCase() === session.username.toLowerCase();
      const isAdminRole = u.role === 'admin';
      const createdDate = u.createdAt ? new Date(u.createdAt).toLocaleDateString(isEn ? 'en-US' : 'vi-VN') : (isEn ? 'Default' : 'Mặc định');

      const tr = document.createElement('tr');

      tr.innerHTML = `
        <td style="text-align:center; font-weight:600;">${idx + 1}</td>
        <td>
          <strong>${escapeHtml(u.username)}</strong>
          ${isCurrent ? `<span style="font-size:0.75rem; color:#16a34a; margin-left:4px;">${isEn ? '(You)' : '(Bạn)'}</span>` : ''}
          ${u.fullName && u.fullName !== u.username ? `<br><small style="color:#64748b;">${escapeHtml(u.fullName)}</small>` : ''}
        </td>
        <td>
          <span class="user-role-badge ${isAdminRole ? 'role-admin' : u.role === 'teacher' ? 'role-teacher' : 'role-user'}">
            ${isAdminRole ? 'Admin' : u.role === 'teacher' ? (isEn ? 'Teacher' : 'Giáo viên') : (isEn ? 'Member' : 'Thành viên')}
          </span>
        </td>
        <td class="account-levels-cell"></td>
        <td style="font-size:0.8rem; color:#64748b;">${createdDate}</td>
        <td style="text-align:right;">
          <button type="button" class="btn-icon-action btn-edit-pw" onclick="handleChangePassword('${u.username}')" title="${isEn ? 'Change password' : 'Đổi mật khẩu'}">
            ✏️ ${isEn ? 'Change PW' : 'Đổi MK'}
          </button>
          ${!isCurrent ? `
            <button type="button" class="btn-icon-action btn-del" onclick="handleDeleteUser('${u.username}')" title="${isEn ? 'Delete account' : 'Xóa tài khoản'}">
              🗑️ ${isEn ? 'Delete' : 'Xóa'}
            </button>
          ` : `<span style="font-size:0.75rem; color:#94a3b8; font-style:italic;">${isEn ? 'In use' : 'Đang dùng'}</span>`}
        </td>
      `;
      const education = window.MathAppEducation;
      const levelCell = tr.querySelector('.account-levels-cell');
      if (education && levelCell) {
        if (isAdminRole) {
          levelCell.textContent = isEn ? 'All levels (Admin)' : 'Tất cả cấp học (Admin)';
        } else {
          const fieldset = document.createElement('fieldset');
          fieldset.style.cssText = 'border:0;padding:0;margin:0;display:grid;gap:4px;';
          const legend = document.createElement('legend');
          legend.textContent = (isEn ? 'Levels for ' : 'Cấp học của ') + u.username;
          legend.style.cssText = 'font-size:.8rem;font-weight:600;';
          fieldset.appendChild(legend);
          const current = education.assigned(u);
          const boxes = education.levels.map(value => {
            const label = document.createElement('label');
            label.style.cssText = 'display:flex;gap:6px;align-items:center;font-size:.8rem;';
            const box = document.createElement('input');box.type = 'checkbox';box.value = value;box.checked = current.includes(value);
            label.append(box, document.createTextNode(education.labels[value][isEn ? 1 : 0]));fieldset.appendChild(label);return box;
          });
          const save = document.createElement('button');save.type = 'button';save.className = 'btn-icon-action btn-save-levels';
          save.textContent = isEn ? 'Save levels' : 'Lưu cấp học';save.disabled = true;
          const selected = () => boxes.filter(box => box.checked).map(box => box.value);
          boxes.forEach(box => box.addEventListener('change', () => { save.disabled = JSON.stringify(selected()) === JSON.stringify(current); }));
          save.addEventListener('click', async () => {
            if (session.role !== 'admin') return;
            save.disabled = true;boxes.forEach(box => { box.disabled = true; });
            try {
              const result = await VMOAuth.updateEducationLevels(u.username, selected());
              showAlert(result.message, result.success);
              if (result.success) await renderUsers();
            } catch { showAlert(isEn ? 'Unable to save levels.' : 'Không thể lưu cấp học.', false); }
            finally { boxes.forEach(box => { box.disabled = false; });save.disabled = JSON.stringify(selected()) === JSON.stringify(current); }
          });
          fieldset.appendChild(save);levelCell.appendChild(fieldset);
        }
      }
      if (!isCurrent) {
        const cell = tr.lastElementChild;
        const editor = document.createElement('span');
        editor.style.cssText = 'display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap;margin:4px;';
        const select = document.createElement('select');
        select.setAttribute('aria-label', (isEn ? 'Role for ' : 'Quyền của ') + u.username);
        select.style.cssText = 'font:inherit;padding:6px;border:1px solid #cbd5e1;border-radius:6px;max-width:150px;';
        for (const [value, label] of [['student', isEn ? 'Member' : 'Thành viên'], ['teacher', isEn ? 'Teacher' : 'Giáo viên'], ['admin', 'Admin']]) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = label;
          select.appendChild(option);
        }
        select.value = u.role || 'student';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn-icon-action btn-change-role';
        button.textContent = isEn ? 'Change role' : 'Đổi quyền';
        button.disabled = true;
        select.addEventListener('change', () => { button.disabled = select.value === (u.role || 'student'); });
        button.addEventListener('click', async () => {
          if (session.role !== 'admin') return;
          button.disabled = true;
          select.disabled = true;
          try {
            const result = await VMOAuth.updateRole(u.username, select.value);
            showAlert(result.message, result.success);
            if (result.success) await renderUsers();
          } catch {
            showAlert(isEn ? 'Unable to change role. Please try again.' : 'Không thể đổi quyền. Vui lòng thử lại.', false);
          } finally {
            select.disabled = false;
            button.disabled = select.value === (u.role || 'student');
          }
        });
        editor.append(select, button);
        cell.prepend(editor);
      }
      usersTableBody.appendChild(tr);
    });
  }

  // 7. Xử lý Đổi Mật khẩu
  window.handleChangePassword = async function(targetUsername) {
    const newPw = await requestNewPassword(targetUsername);
    if (newPw === null) return;
    if (newPw.length < 8) {
      showAlert('Mật khẩu mới phải có độ dài từ 8 ký tự trở lên!', false);
      return;
    }
    const res = await VMOAuth.updatePassword(targetUsername, newPw);
    if (res.success) {
      showAlert(res.message, true);
      renderUsers();
    } else {
      showAlert(res.message, false);
    }
  };

  // 8. Xử lý Xóa Tài khoản
  window.handleDeleteUser = async function(targetUsername) {
    let confirmed = true;
    try {
      confirmed = confirm(`Bạn có chắc chắn muốn xóa tài khoản "${targetUsername}" không?`);
    } catch (e) {
      confirmed = true;
    }
    if (!confirmed) return;

    const res = await VMOAuth.deleteUser(targetUsername);
    if (res.success) {
      showAlert(res.message, true);
      renderUsers();
    } else {
      showAlert(res.message, false);
    }
  };

  // 9. Xử lý Tạo Tài khoản Mới
  if (addUserForm) {
    addUserForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const u = document.getElementById('newUsername').value.trim();
      const p = document.getElementById('newPassword').value;
      const r = document.getElementById('newRole').value;
      const n = document.getElementById('newName').value.trim();

      const submitButton = addUserForm.querySelector('button[type="submit"]');
      if (submitButton) submitButton.disabled = true;
      const res = await VMOAuth.createUser(u, p, r, n, [...document.querySelectorAll('#newEducationLevels input:checked')].map(box => box.value));
      if (submitButton) submitButton.disabled = false;
      if (res.success) {
        showAlert(res.message, true);
        addUserForm.reset();
        syncNewLevelControl();
        renderUsers();
      } else {
        showAlert(res.message, false);
      }
    });
  }
}

// Khởi chạy khi DOM đã sẵn sàng (hỗ trợ cả trường hợp script chạy sau khi DOMContentLoaded đã kích hoạt)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAccountMgmt);
} else {
  initAccountMgmt();
}
