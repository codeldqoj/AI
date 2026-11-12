import { assigned, valid } from '../lib/education-access.js';
import { getDb } from '../lib/db.js';
import bcrypt from 'bcryptjs';
import { clearSessionCookie, getSession, setSessionCookie, signSession } from '../lib/session.js';
import { recordActivity } from '../lib/learning.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        return res.status(400).json({ success: false, error: 'Payload không hợp lệ' });
      }
    }

    const { action, username, password, fullName, role, targetUsername, newPassword, educationLevels } = body || {};

    if (action === 'me') {
      const session = await getSession(req);
      return session ? res.status(200).json({ success: true, user: session })
        : res.status(401).json({ success: false, error: 'Chưa đăng nhập' });
    }
    if (action === 'logout') {
      const session = await getSession(req);
      clearSessionCookie(res, req);
      if (session) {
        try { await recordActivity(await getDb(), session, 'logout'); }
        catch (error) { console.error('[Logout activity]', error); }
      }
      return res.status(200).json({ success: true });
    }

    // Cho phép giao diện kiểm tra hệ thống đã có tài khoản hay chưa.
    // Không trả về thông tin người dùng hoặc dữ liệu nhạy cảm.
    if (action === 'bootstrap_status') {
      const db = await getDb();
      const userCount = await db.collection('users').countDocuments({}, { limit: 1 });
      return res.status(200).json({ success: true, needsBootstrap: userCount === 0 });
    }

    const db = await getDb();
    const users = db.collection('users');

    // Các thao tác quản trị luôn được kiểm tra bằng cookie phiên ở phía server.
    const adminActions = new Set(['list_users', 'create_user', 'update_password', 'update_role', 'update_education_levels', 'delete_user']);
    if (adminActions.has(action)) {
      const session = await getSession(req);
      if (!session) {
        return res.status(401).json({ success: false, error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn' });
      }
      if (session.role !== 'admin') {
        return res.status(403).json({ success: false, error: 'Chỉ quản trị viên mới có quyền thực hiện thao tác này' });
      }

      if (action === 'list_users') {
        const list = await users.find({}, {
          projection: { password: 0 }
        }).sort({ createdAt: 1, username: 1 }).toArray();
        return res.status(200).json({
          success: true,
          users: list.map(user => ({
            id: String(user._id),
            username: user.username,
            fullName: user.fullName || user.username,
            role: user.role || 'student',
            educationLevels: assigned(user),
            createdAt: user.createdAt || null,
            updatedAt: user.updatedAt || null
          }))
        });
      }

      if (action === 'create_user') {
        const cleanNewUsername = String(username || '').trim().toLowerCase();
        const cleanFullName = String(fullName || '').trim();
        const cleanRole = ['admin', 'teacher', 'student'].includes(role) ? role : 'student';

        if (!/^[a-z0-9_.-]{3,64}$/.test(cleanNewUsername)) {
          return res.status(400).json({ success: false, error: 'Tên đăng nhập phải có 3–64 ký tự: chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang' });
        }
        if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
          return res.status(400).json({ success: false, error: 'Mật khẩu phải có từ 8 đến 128 ký tự' });
        }
        if (cleanFullName.length > 120) {
          return res.status(400).json({ success: false, error: 'Họ và tên không được vượt quá 120 ký tự' });
        }

        await users.createIndex({ username: 1 }, { unique: true });
        const exists = await users.findOne({ username: cleanNewUsername }, { projection: { _id: 1 } });
        if (exists) {
          return res.status(409).json({ success: false, error: 'Tên tài khoản đã tồn tại' });
        }

        if (educationLevels !== undefined && !valid(educationLevels)) return res.status(400).json({ success: false, error: 'Danh sách cấp học không hợp lệ' });
        const createdUser = {
          username: cleanNewUsername,
          password: await bcrypt.hash(password, 12),
          fullName: cleanFullName || cleanNewUsername,
          role: cleanRole,
          educationLevels: educationLevels === undefined ? [] : educationLevels,
          createdAt: new Date(),
          createdBy: session.username
        };
        await users.insertOne(createdUser);
        await recordActivity(db, session, 'account.created', { itemTitle: cleanNewUsername });
        return res.status(201).json({ success: true, message: `Đã tạo tài khoản "${cleanNewUsername}"` });
      }

      const cleanTarget = String(targetUsername || '').trim().toLowerCase();
      if (!cleanTarget) {
        return res.status(400).json({ success: false, error: 'Thiếu tên tài khoản cần thao tác' });
      }
      const target = await users.findOne({ username: cleanTarget });
      if (!target) {
        return res.status(404).json({ success: false, error: 'Không tìm thấy tài khoản' });
      }

      if (action === 'update_education_levels') {
        if (!valid(educationLevels)) return res.status(400).json({ success: false, error: 'Danh sách cấp học không hợp lệ' });
        if (target.role === 'admin') return res.status(400).json({ success: false, error: 'Admin có toàn quyền các cấp học' });
        await users.updateOne({ _id: target._id }, { $set: { educationLevels, updatedAt: new Date(), updatedBy: session.username } });
        await recordActivity(db, session, 'account.updated', { itemTitle: cleanTarget });
        return res.status(200).json({ success: true, message: `Đã cập nhật cấp học cho "${cleanTarget}". Người dùng cần đăng nhập lại.` });
      }

      if (action === 'update_role') {
        if (!['admin', 'teacher', 'student'].includes(role)) {
          return res.status(400).json({ success: false, error: 'Vai trò không hợp lệ' });
        }
        if (String(target._id) === session.sub || cleanTarget === session.username) {
          return res.status(400).json({ success: false, error: 'Không thể đổi quyền tài khoản đang đăng nhập' });
        }
        if ((target.role || 'student') === role) {
          return res.status(200).json({ success: true, message: 'Tài khoản đã có quyền này' });
        }
        await users.updateOne({ _id: target._id }, {
          $set: { role, updatedAt: new Date(), updatedBy: session.username }
        });
        await recordActivity(db, session, 'account.updated', { itemTitle: cleanTarget });
        return res.status(200).json({ success: true, message: `Đã cập nhật quyền cho "${cleanTarget}". Người dùng cần đăng nhập lại.` });
      }

      if (action === 'update_password') {
        if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
          return res.status(400).json({ success: false, error: 'Mật khẩu mới phải có từ 8 đến 128 ký tự' });
        }
        await users.updateOne({ _id: target._id }, {
          $set: {
            password: await bcrypt.hash(newPassword, 12),
            updatedAt: new Date(),
            updatedBy: session.username
          }
        });
        await recordActivity(db, session, 'account.updated', { itemTitle: cleanTarget });
        return res.status(200).json({ success: true, message: `Đã cập nhật mật khẩu cho "${cleanTarget}"` });
      }

      if (cleanTarget === session.username) {
        return res.status(400).json({ success: false, error: 'Không thể xóa tài khoản đang đăng nhập' });
      }
      if (target.role === 'admin') {
        const adminCount = await users.countDocuments({ role: 'admin' }, { limit: 2 });
        if (adminCount <= 1) {
          return res.status(400).json({ success: false, error: 'Không thể xóa quản trị viên duy nhất' });
        }
      }
      await users.deleteOne({ _id: target._id });
      await recordActivity(db, session, 'account.deleted', { itemTitle: cleanTarget });
      return res.status(200).json({ success: true, message: `Đã xóa tài khoản "${cleanTarget}"` });
    }

    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
      return res.status(400).json({ success: false, error: 'Vui lòng nhập tên đăng nhập và mật khẩu' });
    }

    const cleanUsername = String(username).trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,64}$/.test(cleanUsername)) {
      return res.status(400).json({ success: false, error: 'Tên đăng nhập không hợp lệ' });
    }

    // Khởi tạo quản trị viên duy nhất khi database hoàn toàn chưa có người dùng.
    // Sau lần tạo đầu tiên, hành động này tự động bị khóa.
    if (action === 'bootstrap_admin') {
      if (password.length < 8 || password.length > 128) {
        return res.status(400).json({ success: false, error: 'Mật khẩu phải có ít nhất 8 ký tự' });
      }

      const existingUser = await users.findOne({}, { projection: { _id: 1 } });
      if (existingUser) {
        return res.status(409).json({ success: false, error: 'Hệ thống đã được khởi tạo' });
      }

      await users.createIndex({ username: 1 }, { unique: true });
      const hashedPassword = await bcrypt.hash(password, 12);
      const adminUser = {
        username: cleanUsername,
        password: hashedPassword,
        fullName: fullName ? String(fullName).trim() : cleanUsername,
        role: 'admin',
        createdAt: new Date(),
        bootstrapAdmin: true
      };
      const adminInsert = await users.insertOne(adminUser);

      setSessionCookie(res, signSession(adminUser), req);
      await recordActivity(db, { sub: String(adminInsert.insertedId), username: adminUser.username }, 'login');
      return res.status(201).json({
        success: true,
        message: 'Khởi tạo quản trị viên thành công',
        user: {
          username: adminUser.username,
          fullName: adminUser.fullName,
          educationLevels: assigned(adminUser),
          role: adminUser.role
        }
      });
    }

    // Đăng ký tài khoản
    if (action === 'register') {
      if (password.length < 8 || password.length > 128) {
        return res.status(400).json({ success: false, error: 'Mật khẩu phải có từ 8 đến 128 ký tự' });
      }
      const exist = await users.findOne({ username: cleanUsername });
      if (exist) {
        return res.status(400).json({ success: false, error: 'Tên tài khoản đã tồn tại' });
      }

      const hashedPassword = await bcrypt.hash(password, 12);
      const newUser = {
        username: cleanUsername,
        password: hashedPassword,
        fullName: fullName ? String(fullName).trim() : cleanUsername,
        role: 'student',
        educationLevels: [],
        createdAt: new Date()
      };
      const newUserInsert = await users.insertOne(newUser);
      await recordActivity(db, { sub: String(newUserInsert.insertedId), username: cleanUsername }, 'account.created');

      return res.status(201).json({ success: true, message: 'Đăng ký thành công' });
    }

    // Đăng nhập
    if (action === 'login') {
      const user = await users.findOne({ username: cleanUsername });
      if (!user) {
        return res.status(400).json({ success: false, error: 'Sai tài khoản hoặc mật khẩu' });
      }

      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        return res.status(400).json({ success: false, error: 'Sai tài khoản hoặc mật khẩu' });
      }

      setSessionCookie(res, signSession(user), req);
      await recordActivity(db, { sub: String(user._id), username: user.username }, 'login');
      return res.status(200).json({
        success: true,
        user: { 
          username: user.username, 
          fullName: user.fullName || user.username, 
          role: user.role || 'student', educationLevels: assigned(user)
        }
      });
    }

    return res.status(400).json({ success: false, error: 'Hành động (action) không hợp lệ' });
  } catch (err) {
    console.error('LỖI THỰC THI AUTH:', err);
    return res.status(500).json({ 
      success: false,
      error: 'Lỗi xác thực hệ thống',
      details: err.message 
    });
  }
};
