import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// Enable JSON body parsing and URL-encoded forms
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Set CORS & Security Headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Database Path
const DB_PATH = path.join(__dirname, 'data', 'database.json');

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

// Read database safely
function readDb() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      const initialDb = { students: [], exams: [], submissions: [] };
      fs.writeFileSync(DB_PATH, JSON.stringify(initialDb, null, 2), 'utf-8');
      return initialDb;
    }
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading database:', err);
    return { students: [], exams: [], submissions: [] };
  }
}

// Write database safely
function writeDb(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
    syncDatabaseToGitHub(data);
    return true;
  } catch (err) {
    console.error('Error writing database:', err);
    return false;
  }
}

// GitHub Auto-Persistence Integration
let isSyncingToGitHub = false;
let pendingGitHubSync = false;

async function syncDatabaseToGitHub(data) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const repo = process.env.GITHUB_REPO || 'nucrackers/nucrackers';
  const branch = process.env.GITHUB_BRANCH || 'main';
  const filePath = 'data/database.json';

  if (!token) return;

  if (isSyncingToGitHub) {
    pendingGitHubSync = true;
    return;
  }

  isSyncingToGitHub = true;
  pendingGitHubSync = false;

  try {
    const contentStr = JSON.stringify(data, null, 2);
    const contentBase64 = Buffer.from(contentStr).toString('base64');

    let fileSha = null;
    try {
      const getFileRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}?ref=${branch}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'NUCrackers-AutoSync'
        }
      });
      if (getFileRes.ok) {
        const fileData = await getFileRes.json();
        fileSha = fileData.sha;
      }
    } catch (fetchErr) {
      console.warn('[GitHub Sync] Fetch failed:', fetchErr.message);
    }

    const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'NUCrackers-AutoSync'
      },
      body: JSON.stringify({
        message: `Auto-Sync Database: Updated student data (${new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })}) [skip ci]`,
        content: contentBase64,
        sha: fileSha || undefined,
        branch: branch
      })
    });

    if (putRes.ok) {
      console.log('[GitHub Sync] Successfully committed database.json to GitHub!');
    }
  } catch (err) {
    console.error('[GitHub Sync] Error syncing to GitHub:', err);
  } finally {
    isSyncingToGitHub = false;
    if (pendingGitHubSync) {
      setTimeout(() => syncDatabaseToGitHub(readDb()), 3000);
    }
  }
}

// 8-Digit Unique Roll Generator: [Unit Code 1 Digit] + [Year 2 Digits] + [Group 2 Digits] + [Serial 3 Digits]
function generate8DigitRoll(db, group, year = '27') {
  const cleanGroup = String(group || 'science').trim().toLowerCase();
  const unitCode = '1';
  const yearCode = String(year).padStart(2, '0').slice(-2);
  let groupCode = '01';
  if (cleanGroup === 'humanities' || cleanGroup === 'arts') groupCode = '02';
  if (cleanGroup === 'business' || cleanGroup === 'commerce') groupCode = '03';

  const prefix = `${unitCode}${yearCode}${groupCode}`;
  const existingRolls = new Set(
    (db.students || [])
      .map(s => String(s.roll || '').trim())
      .filter(r => r.startsWith(prefix) && r.length === 8)
  );

  let serial = 1;
  let candidate = '';
  do {
    candidate = `${prefix}${String(serial).padStart(3, '0')}`;
    serial++;
  } while (existingRolls.has(candidate) && serial < 999);

  return candidate;
}

// ==========================================
// API ROUTES
// ==========================================

// 1. Student Login via Roll & Name
app.post('/api/auth/login', (req, res) => {
  const { roll, name } = req.body;
  if (!roll || typeof roll !== 'string' || !roll.trim()) {
    return res.status(400).json({ success: false, message: 'অনুগ্রহ করে রোল নম্বর প্রদান করুন।' });
  }

  const cleanRoll = roll.trim().toLowerCase();
  const db = readDb();
  const student = (db.students || []).find(s => String(s.roll || '').trim().toLowerCase() === cleanRoll);

  if (!student) {
    return res.status(404).json({
      success: false,
      message: `রোল নম্বর "${roll.trim()}" সঠিক নয় বা ডাটাবেজে পাওয়া যায়নি।`
    });
  }

  const status = student.status || 'approved';
  if (status === 'pending') {
    return res.status(403).json({
      success: false,
      message: 'আপনার রেজিস্ট্রেশনটি পর্যালোচনার জন্য পেন্ডিং আছে। এডমিন অনুমোদন করার পরেই আপনি পরীক্ষা দিতে পারবেন।'
    });
  }
  if (status === 'rejected') {
    return res.status(403).json({
      success: false,
      message: `আপনার রেজিস্ট্রেশনটি বাতিল করা হয়েছে। কারণ: ${student.rejectReason || 'অসম্পূর্ণ বা ভুল তথ্য'}`
    });
  }

  // Determine Target Exam Page based on student's group
  const stdGroup = String(student.group || 'science').toLowerCase().trim();
  let targetPage = 'science-exams.html';
  if (stdGroup === 'arts' || stdGroup === 'humanities') {
    targetPage = 'arts-exams.html';
  } else if (stdGroup === 'commerce' || stdGroup === 'business') {
    targetPage = 'commerce-exams.html';
  }

  res.json({
    success: true,
    message: 'লগইন সফল হয়েছে!',
    targetPage: targetPage,
    student: {
      id: student.id || student.roll,
      roll: student.roll,
      name: student.name,
      group: stdGroup,
      college: student.college || '',
      district: student.district || '',
      whatsapp: student.whatsapp || '',
      status: student.status || 'approved'
    }
  });
});

// 2. Student Registration Submission
app.post(['/api/registration/submit', '/api/students/register'], (req, res) => {
  const { name, college, district, group, whatsapp, paymentMethod, paymentNumber, transactionId } = req.body;

  if (!name || !college || !district || !group || !whatsapp || !paymentNumber || !transactionId) {
    return res.status(400).json({ success: false, message: 'অনুগ্রহ করে ফরমের সকল প্রয়োজনীয় তথ্য পূরণ করুন।' });
  }

  const cleanTrx = String(transactionId).trim().toUpperCase();
  const cleanPhone = String(whatsapp).trim();
  const cleanPayNumber = String(paymentNumber).trim();
  const db = readDb();

  const existing = (db.students || []).find(
    s => (s.transactionId && String(s.transactionId).trim().toUpperCase() === cleanTrx)
  );

  if (existing) {
    return res.status(409).json({
      success: false,
      message: `এই ট্রানজেকশন আইডি (${cleanTrx}) ইতিমধ্যে একবার ব্যবহার করা হয়েছে।`
    });
  }

  const registrationId = `reg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const newStudent = {
    id: registrationId,
    roll: '',
    name: String(name).trim(),
    college: String(college).trim(),
    district: String(district).trim(),
    group: String(group).trim().toLowerCase(),
    whatsapp: cleanPhone,
    paymentMethod: paymentMethod || 'bKash',
    paymentNumber: cleanPayNumber,
    transactionId: cleanTrx,
    status: 'pending',
    registeredAt: new Date().toISOString()
  };

  db.students.push(newStudent);
  writeDb(db);

  return res.status(201).json({
    success: true,
    message: 'আপনার রেজিস্ট্রেশন সফল হয়েছে! এডমিন যাচাই শেষে আপনার WhatsApp-এ ইউনিক রোল পাঠাবে।',
    registration: newStudent
  });
});

// 3. Admin Login
const ADMIN_PASSWORDS = ['Nucrackers#.com', 'nucrackers#.com', 'admin123'];
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const cleanPass = String(password || '').trim().replace(/^["']|["']$/g, '');
  if (ADMIN_PASSWORDS.some(p => p.toLowerCase() === cleanPass.toLowerCase())) {
    return res.json({ success: true, message: 'এডমিন লগইন সফল!', token: 'nu-admin-authorized-token' });
  }
  return res.status(401).json({ success: false, message: 'ভুল এডমিন পাসওয়ার্ড!' });
});

// 4. Admin Stats
app.get('/api/admin/stats', (req, res) => {
  const db = readDb();
  const students = db.students || [];
  const exams = db.exams || [];
  res.json({
    success: true,
    stats: {
      totalStudents: students.length,
      pendingCount: students.filter(s => s.status === 'pending').length,
      approvedCount: students.filter(s => s.status !== 'pending').length,
      scienceCount: students.filter(s => s.group === 'science').length,
      artsCount: students.filter(s => s.group === 'arts' || s.group === 'humanities').length,
      commerceCount: students.filter(s => s.group === 'commerce' || s.group === 'business').length,
      totalExams: exams.length,
      totalQuestions: exams.reduce((acc, e) => acc + (e.questions || []).length, 0),
      totalSubmissions: (db.submissions || []).length
    }
  });
});

// 5. Admin: Get all students
app.get('/api/admin/students', (req, res) => {
  const db = readDb();
  res.json({ success: true, students: db.students || [] });
});

// 6. Admin: Add Student Manually
app.post('/api/admin/students', (req, res) => {
  const { roll, name, group, college, district, whatsapp } = req.body;
  if (!roll || !name || !group) {
    return res.status(400).json({ success: false, message: 'নাম, রোল এবং গ্রুপ আবশ্যক।' });
  }
  const db = readDb();
  const cleanRoll = String(roll).trim();
  const existing = (db.students || []).find(s => s.roll && String(s.roll).trim().toLowerCase() === cleanRoll.toLowerCase());
  if (existing) {
    return res.status(409).json({ success: false, message: `রোল "${cleanRoll}" ইতিমধ্যে তালিকায় আছে।` });
  }

  const newStudent = {
    id: `std_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    roll: cleanRoll,
    name: String(name).trim(),
    group: String(group).trim().toLowerCase(),
    college: college ? String(college).trim() : '',
    district: district ? String(district).trim() : '',
    whatsapp: whatsapp ? String(whatsapp).trim() : '',
    status: 'approved',
    registeredAt: new Date().toISOString(),
    approvedAt: new Date().toISOString()
  };

  db.students.push(newStudent);
  writeDb(db);
  res.status(201).json({ success: true, message: `শিক্ষার্থী "${newStudent.name}" যুক্ত করা হয়েছে!`, student: newStudent });
});

// 7. Admin: APPROVE STUDENT (Supports Empty Rolls, ID, TrxID, all legacy/new routes)
app.all([
  '/api/admin/students/:identifier/approve',
  '/api/students/:identifier/approve',
  '/api/registration/:identifier/approve',
  '/api/admin/students/approve',
  '/api/students/approve'
], (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const identifier = req.params.identifier || req.body.identifier || req.body.id || req.body.roll || req.body.transactionId;
  const { customRoll, year = '27' } = req.body || {};
  const db = readDb();

  const cleanId = identifier ? String(identifier).trim().toLowerCase() : '';
  const student = (db.students || []).find(s => {
    if (cleanId) {
      if (s.id && String(s.id).trim().toLowerCase() === cleanId) return true;
      if (s.roll && String(s.roll).trim().toLowerCase() === cleanId) return true;
      if (s.transactionId && String(s.transactionId).trim().toLowerCase() === cleanId) return true;
      if (s.whatsapp && String(s.whatsapp).trim().toLowerCase() === cleanId) return true;
    }
    if (req.body.id && s.id === req.body.id) return true;
    if (req.body.transactionId && s.transactionId === req.body.transactionId) return true;
    return false;
  });

  if (!student) {
    return res.status(404).json({ success: false, message: 'শিক্ষার্থী পাওয়া যায়নি।' });
  }

  let finalRoll = '';
  if (customRoll && String(customRoll).trim()) {
    finalRoll = String(customRoll).trim();
  } else if (student.roll && String(student.roll).trim().length === 8) {
    finalRoll = String(student.roll).trim();
  } else {
    finalRoll = generate8DigitRoll(db, student.group || 'science', year);
  }

  const duplicate = (db.students || []).find(
    s => s !== student && s.roll && String(s.roll).trim().toLowerCase() === finalRoll.toLowerCase()
  );
  if (duplicate) {
    return res.status(409).json({
      success: false,
      message: `রোল "${finalRoll}" ইতিমধ্যে শিক্ষার্থী "${duplicate.name}" এর জন্য বরাদ্দ আছে। অন্য রোল দিন।`
    });
  }

  student.id = student.id || `std_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  student.roll = String(finalRoll).trim();
  student.status = 'approved';
  student.approvedAt = new Date().toISOString();
  writeDb(db);

  return res.json({
    success: true,
    message: `শিক্ষার্থী "${student.name}" কে সফলভাবে অনুমোদন করা হয়েছে! বরাদ্দকৃত রোল: ${student.roll}`,
    student
  });
});

// 8. Admin: Record WhatsApp Sent
app.all([
  '/api/admin/students/:identifier/record-whatsapp-sent',
  '/api/students/:identifier/record-whatsapp-sent',
  '/api/students/record-whatsapp-sent'
], (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const identifier = req.params.identifier || req.body.identifier || req.body.id || req.body.roll;
  const db = readDb();
  const cleanId = identifier ? String(identifier).trim().toLowerCase() : '';
  const student = (db.students || []).find(s => (s.id && String(s.id).toLowerCase() === cleanId) || (s.roll && String(s.roll).toLowerCase() === cleanId));
  if (student) {
    student.whatsappSent = true;
    student.whatsappSentAt = new Date().toISOString();
    writeDb(db);
  }
  return res.json({ success: true });
});

// 9. Admin: Delete Student
app.delete(['/api/admin/students/:identifier', '/api/students/:identifier'], (req, res) => {
  const { identifier } = req.params;
  const db = readDb();
  const cleanId = String(identifier).trim().toLowerCase();
  db.students = (db.students || []).filter(
    s => (s.id && String(s.id).trim().toLowerCase() !== cleanId) &&
         (s.roll && String(s.roll).trim().toLowerCase() !== cleanId)
  );
  writeDb(db);
  res.json({ success: true, message: 'শিক্ষার্থীর তথ্য সফলভাবে মুছে ফেলা হয়েছে।' });
});

// 10. Exam Management Endpoints
app.get('/api/exams', (req, res) => {
  const db = readDb();
  const { group, type } = req.query;
  let exams = db.exams || [];
  if (group) exams = exams.filter(e => e.group === group || e.group === 'all');
  if (type) exams = exams.filter(e => e.type === type);
  res.json({ success: true, exams });
});

app.get('/api/exams/:id', (req, res) => {
  const db = readDb();
  const exam = (db.exams || []).find(e => e.id === req.params.id);
  if (!exam) return res.status(404).json({ success: false, message: 'পরীক্ষা পাওয়া যায়নি।' });
  res.json({ success: true, exam });
});

app.post('/api/exams/:id/submit', (req, res) => {
  const { id } = req.params;
  const { roll, studentName, group, answers, timeSpentSeconds } = req.body;
  const db = readDb();
  const exam = (db.exams || []).find(e => e.id === id);
  if (!exam) return res.status(404).json({ success: false, message: 'পরীক্ষা পাওয়া যায়নি।' });

  let correctCount = 0;
  let wrongCount = 0;
  let unattemptedCount = 0;
  (exam.questions || []).forEach((q, idx) => {
    const studentAns = answers ? answers[idx] : undefined;
    if (studentAns === undefined || studentAns === null || studentAns === '') {
      unattemptedCount++;
    } else if (Number(studentAns) === Number(q.correct)) {
      correctCount++;
    } else {
      wrongCount++;
    }
  });

  const marksPerQuestion = exam.marksPerQuestion || 1;
  const negativeMarking = exam.negativeMarking || 0.25;
  const totalScore = Math.max(0, (correctCount * marksPerQuestion) - (wrongCount * negativeMarking));

  const submission = {
    id: `sub_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    examId: id,
    examTitle: exam.title,
    roll: String(roll).trim(),
    studentName: studentName || 'অজ্ঞাত শিক্ষার্থী',
    group: group || exam.group,
    totalQuestions: (exam.questions || []).length,
    correctCount,
    wrongCount,
    unattemptedCount,
    score: parseFloat(totalScore.toFixed(2)),
    timeSpentSeconds: timeSpentSeconds || 0,
    submittedAt: new Date().toISOString()
  };

  db.submissions = db.submissions || [];
  db.submissions.push(submission);
  writeDb(db);
  res.json({ success: true, submission });
});

// Explicit JSON 404 for unhandled API endpoints
app.all('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API Route not found: ${req.method} ${req.path}`
  });
});

// Serve static frontend files
app.use(express.static(__dirname, { extensions: ['html'] }));

// Fallback to index.html ONLY for page navigation
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'API Route not found' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
