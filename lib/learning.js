const ACTIONS = new Set([
  'login', 'logout', 'account.created', 'account.updated', 'account.deleted',
  'solution.saved', 'evaluation.saved', 'guide.saved', 'guide.updated', 'guide.deleted', 'submission.deleted',
  'submission.verified', 'submission.verification_revoked', 'submission.content_updated',
  'document.added', 'document.deleted', 'exam.added', 'exam.image_saved', 'exam.deleted',
  'event.added', 'event.deleted', 'catalog.updated', 'catalog.synced'
]);

export async function recordActivity(db, session, action, details = {}) {
  if (!session?.sub || !ACTIONS.has(action)) return;
  const safeDetails = {};
  for (const key of ['problemKey', 'problemTitle', 'setTitle', 'sourceGroup', 'score', 'submissionId', 'itemTitle', 'ownerUsername']) {
    if (details[key] !== undefined && details[key] !== null) {
      safeDetails[key] = String(details[key]).slice(0, key === 'problemKey' ? 180 : 300);
    }
  }
  try {
    await db.collection('activity_events').insertOne({
      userId: String(session.sub),
      username: String(session.username || '').slice(0, 64),
      action,
      details: safeDetails,
      createdAt: new Date()
    });
  } catch (error) {
    // Việc ghi log không được làm mất một bài giải hoặc một phiên đăng nhập đã lưu.
    console.error('[Activity log]', error);
  }
}

export async function deleteAiGuideRecord(db, session, id) {
  const deleted = await db.collection('submissions').findOneAndDelete({
    _id: id, submissionKind: 'ai_guide'
  });
  if (!deleted) return null;
  await db.collection('submission_images').deleteMany({ submissionId: id });
  await recordActivity(db, session, 'guide.deleted', {
    submissionId: id, problemKey: deleted.problemKey, problemTitle: deleted.problemTitle,
    setTitle: deleted.problemSnapshot?.setTitle, ownerUsername: deleted.username
  });
  return deleted;
}

export function learningScope(session, requestedUsername = '') {
  const username = String(requestedUsername || '').trim().toLowerCase();
  if (!['admin', 'teacher'].includes(session.role)) {
    if (username && username !== session.username) return null;
    return { userId: String(session.sub) };
  }
  return username ? { username } : {};
}

function scoreFromEvaluation(value) {
  const match = String(value ?? '').trim().match(/^(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)(?=\s*(?:đ|điểm|\(|$))/i);
  if (!match) return null;
  const earned = Number(match[1].replace(',', '.'));
  const maximum = Number(match[2].replace(',', '.'));
  return Number.isFinite(earned) && Number.isFinite(maximum) && maximum > 0 && earned >= 0 && earned <= maximum
    ? { earned, maximum }
    : null;
}

export function summarizeLearning(rows, users = [], selectedUsername = '') {
  const members = new Map(users.map(user => [String(user._id), {
    userId: String(user._id), username: user.username, fullName: user.fullName || user.username,
    role: user.role || 'student', guideCount: 0, evaluationCount: 0,
    scoreEarned: 0, scoreMaximum: 0
  }]));
  const latest = new Map();
  for (const row of rows) {
    const guide = row.submissionKind === 'ai_guide';
    if (guide ? (row.solutionContent !== undefined && !String(row.solutionContent).trim())
      : !row.evaluation || typeof row.evaluation !== 'object') continue;
    const userId = String(row.userId || '');
    const problemKey = String(row.problemKey || row.problemId || '');
    if (!userId || !problemKey) continue;
    const key = `${userId}\u0000${guide ? 'guide' : 'evaluation'}\u0000${problemKey}`;
    const timestamp = new Date(row.updatedAt || row.createdAt || 0).getTime() || 0;
    const current = latest.get(key);
    if (!current || timestamp > current.timestamp || (timestamp === current.timestamp && String(row._id) > String(current.row._id))) {
      latest.set(key, { row, guide, timestamp });
    }
  }

  const guides = [];
  const evaluations = [];
  for (const { row, guide, timestamp } of latest.values()) {
    const userId = String(row.userId);
    if (!members.has(userId)) members.set(userId, {
      userId, username: row.username || 'Tài khoản cũ', fullName: row.authorName || row.username || 'Tài khoản cũ',
      role: 'student', guideCount: 0, evaluationCount: 0, scoreEarned: 0, scoreMaximum: 0
    });
    const member = members.get(userId);
    const score = guide ? null : scoreFromEvaluation(row.evaluation?.estimatedScore ?? row.score);
    const item = {
      submissionId: String(row._id || ''),
      userId,
      username: member.username,
      problemKey: String(row.problemKey || row.problemId || ''),
      problemTitle: row.problemSnapshot?.title || row.problemTitle || 'Câu hỏi',
      setTitle: row.problemSnapshot?.setTitle || row.setTitle || 'Chưa xác định bộ đề/chuyên đề',
      sourceGroup: row.problemSnapshot?.sourceGroup || row.sourceGroup || '',
      frontendAnchor: row.problemSnapshot?.frontendAnchor || '',
      savedAt: row.updatedAt || row.createdAt || null,
      ...(guide ? {} : { score: score ? `${score.earned}/${score.maximum}` : String(row.evaluation?.estimatedScore || row.score || ''), scoreEarned: score?.earned ?? null, scoreMaximum: score?.maximum ?? null })
    };
    if (guide) { guides.push(item); member.guideCount++; }
    else {
      evaluations.push(item);
      member.evaluationCount++;
      if (score) { member.scoreEarned += score.earned; member.scoreMaximum += score.maximum; }
    }
  }
  guides.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
  evaluations.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
  const memberList = [...members.values()].sort((a, b) => a.username.localeCompare(b.username, 'vi'));
  const totals = memberList.reduce((sum, member) => ({
    guideCount: sum.guideCount + member.guideCount,
    evaluationCount: sum.evaluationCount + member.evaluationCount,
    scoreEarned: sum.scoreEarned + member.scoreEarned,
    scoreMaximum: sum.scoreMaximum + member.scoreMaximum
  }), { guideCount: 0, evaluationCount: 0, scoreEarned: 0, scoreMaximum: 0 });
  return { totals, members: memberList, guides, evaluations, selectedUsername };
}
