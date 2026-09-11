import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// Enable JSON parsing
app.use(express.json());

const DB_FILE = path.join(__dirname, 'data', 'database.json');

// Helper to read DB safely
function readDb() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      return { students: [], exams: [], submissions: [] };
    }
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading database:', err);
    return { students: [], exams: [], submissions: [] };
  }
}

// Helper to write DB safely and auto-sync to GitHub if configured
function writeDb(data) {
  try {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    
    // Trigger background GitHub Auto-Commit if GITHUB_TOKEN is present
    triggerGitHubSync(data);

    return true;
  } catch (err) {
    console.error('Error writing database:', err);
    return false;
  }
}

// GitHub Auto-Persistence Integration
let isSyncingToGitHub = false;
let pendingGitHubSync = false;

async function triggerGitHubSync(data) {
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
        message: `Auto-Sync Database: Updated student data [skip ci]`,
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
      setTimeout(() => triggerGitHubSync(readDb()), 3000);
    }
  }
}

// 1. Student Login (Only Roll is required, Name is optional)
app.post('/api/auth/login', (req, res) => {
  const { roll } = req.body;
  if (!roll || typeof roll !== 'string' || !roll.trim()) {
    return res.status(400).json({ success: false, message: 'অনুগ্রহ করে রোল নম্বর প্রদান করুন।' });
  }

  const cleanRoll = roll.trim();
  const db = readDb();
  const student = db.students.find(s => String(s.roll).trim().toLowerCase() === cleanRoll.toLowerCase());

  if (!student) {
    return res.status(404).json({
      success: false,
      message: `রোল "${cleanRoll}"-এর কোনো শিক্ষার্থী প্রিমিয়াম তালিকায় পাওয়া যায়নি। সঠিক রোল লিখুন অথবা এডমিনের সাথে যোগাযোগ করুন।`
    });
  }

  const status = student.status || 'approved';
  if (status === 'pending') {
    return res.status(403).json({
      success: false,
      pendingApproval: true,
      message: `আপনার রোলটি (${student.name} - রোল: ${student.roll}) এখনো এডমিন দ্বারা অনুমোদিত (Approve) হয়নি। এডমিন অনুমোদন করার পর আপনি প্রবেশ করতে পারবেন।`
    });
  }

  let targetPage = 'science-exams.html';
  if (student.group === 'arts') targetPage = 'arts-exams.html';
  if (student.group === 'commerce') targetPage = 'commerce-exams.html';

  return res.json({
    success: true,
    message: 'লগইন সফল হয়েছে!',
    student: {
      roll: student.roll,
      name: student.name,
      group: student.group,
      status: student.status || 'approved'
    },
    targetPage
  });
});

// 2. Admin APIs & Routes
const ADMIN_PASSWORDS = ['Nucrackers#.com', 'nucrackers#.com', 'admin123'];

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const cleanPass = String(password || '').trim().replace(/^["']|["']$/g, '');
  if (ADMIN_PASSWORDS.some(p => p.toLowerCase() === cleanPass.toLowerCase())) {
    return res.json({ success: true, message: 'এডমিন লগইন সফল!', token: 'nu-admin-authorized-token' });
  }
  return res.status(401).json({ success: false, message: 'ভুল এডমিন পাসওয়ার্ড!' });
});

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
      artsCount: students.filter(s => s.group === 'arts').length,
      commerceCount: students.filter(s => s.group === 'commerce').length,
      totalExams: exams.length,
      totalQuestions: exams.reduce((acc, e) => acc + (e.questions || []).length, 0),
      totalSubmissions: (db.submissions || []).length
    }
  });
});

app.get('/api/admin/students', (req, res) => {
  const db = readDb();
  res.json({ success: true, students: db.students || [] });
});

app.post('/api/admin/students', (req, res) => {
  const { roll, name, group } = req.body;
  if (!roll || !name || !group) {
    return res.status(400).json({ success: false, message: 'নাম, রোল এবং গ্রুপ আবশ্যক।' });
  }
  const db = readDb();
  const cleanRoll = String(roll).trim();
  const existing = db.students.find(s => String(s.roll).trim().toLowerCase() === cleanRoll.toLowerCase());
  if (existing) {
    return res.status(409).json({ success: false, message: `রোল নম্বর "${cleanRoll}" ইতিমধ্যে তালিকায় আছে।` });
  }
  const newStudent = {
    roll: cleanRoll,
    name: String(name).trim(),
    group: String(group).trim().toLowerCase(),
    status: 'approved',
    registeredAt: new Date().toISOString()
  };
  db.students.push(newStudent);
  writeDb(db);
  res.status(201).json({ success: true, message: `শিক্ষার্থী "${newStudent.name}" (রোল: ${newStudent.roll}) যুক্ত করা হয়েছে!`, student: newStudent });
});

app.delete('/api/admin/students/:roll', (req, res) => {
  const roll = String(req.params.roll).trim();
  const db = readDb();
  db.students = (db.students || []).filter(s => String(s.roll).trim().toLowerCase() !== roll.toLowerCase());
  writeDb(db);
  res.json({ success: true, message: `রোল "${roll}" মুছে ফেলা হয়েছে।` });
});

app.put('/api/admin/students/:roll/approve', (req, res) => {
  const roll = String(req.params.roll).trim();
  const db = readDb();
  const student = (db.students || []).find(s => String(s.roll).trim().toLowerCase() === roll.toLowerCase());
  if (!student) return res.status(404).json({ success: false, message: 'শিক্ষার্থী পাওয়া যায়নি।' });
  student.status = 'approved';
  writeDb(db);
  res.json({ success: true, message: `রোল "${roll}" সফলভাবে অনুমোদন করা হয়েছে!` });
});

// Serve static frontend files
app.use(express.static(__dirname, { extensions: ['html'] }));

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
