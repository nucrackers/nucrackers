import express from 'express';
import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
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
    console.log(`[GitHub Sync] Starting auto-commit to ${repo}...`);
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

// 1. Student Authentication Endpoint (Only roll is required)
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

// 2. Student Self-Registration
app.post('/api/auth/register', (req, res) => {
  const { roll, name, group } = req.body;
  if (!roll || typeof roll !== 'string' || !roll.trim()) {
    return res.status(400).json({ success: false, message: 'অনুগ্রহ করে রোল নম্বর প্রদান করুন।' });
  }
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ success: false, message: 'অনুগ্রহ করে পূর্ণ নাম প্রদান করুন।' });
  }
  if (!group || !['science', 'arts', 'commerce'].includes(group.trim().toLowerCase())) {
    return res.status(400).json({ success: false, message: 'অনুগ্রহ করে সঠিক বিভাগ (Science, Arts, Commerce) নির্বাচন করুন।' });
  }

  const cleanRoll = roll.trim();
  const cleanName = name.trim();
  const cleanGroup = group.trim().toLowerCase();

  const db = readDb();
  const existing = db.students.find(s => String(s.roll).trim().toLowerCase() === cleanRoll.toLowerCase());

  if (existing) {
    return res.status(409).json({
      success: false,
      message: `রোল নম্বর "${cleanRoll}" ইতিমধ্যে নথিবদ্ধ রয়েছে।`
    });
  }

  const newStudent = {
    roll: cleanRoll,
    name: cleanName,
    group: cleanGroup,
    status: 'approved',
    registeredAt: new Date().toISOString()
  };

  db.students.push(newStudent);
  writeDb(db);

  res.status(201).json({
    success: true,
    message: 'রেজিস্ট্রেশন সফল হয়েছে!',
    student: newStudent
  });
});

// 3. List Registered Students
app.get('/api/students', (req, res) => {
  const db = readDb();
  const list = (db.students || []).map(s => ({
    roll: s.roll,
    name: s.name,
    group: s.group,
    status: s.status || 'approved'
  }));
  res.json({ success: true, count: list.length, students: list });
});

// 4. Exams Endpoints
app.get('/api/exams', (req, res) => {
  const { group, roll } = req.query;
  const db = readDb();

  let exams = db.exams || [];
  if (group) {
    exams = exams.filter(e => e.group.toLowerCase() === group.toLowerCase());
  }

  const sanitized = exams.map(e => {
    let studentSubmission = null;
    if (roll) {
      studentSubmission = (db.submissions || []).find(
        s => String(s.examId) === String(e.id) && String(s.roll).trim().toLowerCase() === String(roll).trim().toLowerCase()
      );
    }
    return {
      id: e.id,
      title: e.title,
      group: e.group,
      duration: e.duration,
      totalMarks: e.totalMarks || (e.questions ? e.questions.length : 0),
      questionCount: e.questions ? e.questions.length : 0,
      passingMarks: e.passingMarks || 0,
      negativeMarking: e.negativeMarking || 0,
      active: e.active !== false,
      submitted: !!studentSubmission,
      submissionSummary: studentSubmission ? {
        score: studentSubmission.score,
        totalMarks: studentSubmission.totalMarks,
        submittedAt: studentSubmission.submittedAt
      } : null
    };
  });

  res.json({ success: true, count: sanitized.length, exams: sanitized });
});

app.get('/api/exams/:id', (req, res) => {
  const { id } = req.params;
  const { roll } = req.query;
  const db = readDb();

  const exam = (db.exams || []).find(e => String(e.id) === String(id));
  if (!exam) return res.status(404).json({ success: false, message: 'পরীক্ষাটি পাওয়া যায়নি।' });

  let alreadySubmitted = false;
  let previousSubmission = null;
  if (roll) {
    previousSubmission = (db.submissions || []).find(
      s => String(s.examId) === String(id) && String(s.roll).trim().toLowerCase() === String(roll).trim().toLowerCase()
    );
    if (previousSubmission) alreadySubmitted = true;
  }

  const sanitizedQuestions = (exam.questions || []).map((q, idx) => ({
    id: q.id || idx + 1,
    question: q.question,
    options: q.options
  }));

  res.json({
    success: true,
    exam: {
      id: exam.id,
      title: exam.title,
      group: exam.group,
      duration: exam.duration,
      totalMarks: exam.totalMarks || sanitizedQuestions.length,
      passingMarks: exam.passingMarks || 0,
      negativeMarking: exam.negativeMarking || 0,
      questions: sanitizedQuestions,
      alreadySubmitted,
      previousSubmission: previousSubmission ? {
        score: previousSubmission.score,
        totalMarks: previousSubmission.totalMarks,
        submittedAt: previousSubmission.submittedAt
      } : null
    }
  });
});

app.post('/api/exams/:id/submit', (req, res) => {
  const { id } = req.params;
  const { roll, name, answers, timeSpent } = req.body;

  if (!roll || typeof roll !== 'string' || !roll.trim()) {
    return res.status(400).json({ success: false, message: 'রোল নম্বর আবশ্যক।' });
  }

  const cleanRoll = roll.trim();
  const db = readDb();
  const exam = (db.exams || []).find(e => String(e.id) === String(id));
  if (!exam) return res.status(404).json({ success: false, message: 'পরীক্ষাটি পাওয়া যায়নি।' });

  if (!db.submissions) db.submissions = [];
  const existingSub = db.submissions.find(
    s => String(s.examId) === String(id) && String(s.roll).trim().toLowerCase() === cleanRoll.toLowerCase()
  );

  if (existingSub) {
    return res.status(409).json({
      success: false,
      alreadySubmitted: true,
      message: 'আপনি ইতিমধ্যে এই পরীক্ষায় অংশগ্রহণ করেছেন।',
      submission: existingSub
    });
  }

  let score = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let skippedCount = 0;
  const detailedResults = [];
  const negMark = parseFloat(exam.negativeMarking) || 0;

  (exam.questions || []).forEach((q, idx) => {
    const qId = q.id || idx + 1;
    const studentAns = answers ? answers[qId] : undefined;
    const isCorrect = studentAns !== undefined && studentAns !== null && Number(studentAns) === Number(q.correctAnswer);
    const isSkipped = studentAns === undefined || studentAns === null || studentAns === '';

    if (isSkipped) {
      skippedCount++;
    } else if (isCorrect) {
      correctCount++;
      score += 1;
    } else {
      wrongCount++;
      score -= negMark;
    }

    detailedResults.push({
      questionId: qId,
      question: q.question,
      options: q.options,
      studentAnswer: studentAns !== undefined ? Number(studentAns) : null,
      correctAnswer: Number(q.correctAnswer),
      isCorrect,
      isSkipped,
      explanation: q.explanation || ''
    });
  });

  const finalScore = Math.max(0, Math.round(score * 100) / 100);
  const totalQuestions = (exam.questions || []).length;
  const percentage = totalQuestions > 0 ? Math.round((finalScore / totalQuestions) * 100) : 0;
  const isPassed = finalScore >= (exam.passingMarks || 0);

  const newSubmission = {
    id: 'sub_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
    examId: String(id),
    examTitle: exam.title,
    group: exam.group,
    roll: cleanRoll,
    name: (name || cleanRoll).trim(),
    score: finalScore,
    totalMarks: totalQuestions,
    correctCount,
    wrongCount,
    skippedCount,
    percentage,
    isPassed,
    timeSpent: timeSpent || 0,
    submittedAt: new Date().toISOString(),
    detailedResults
  };

  db.submissions.push(newSubmission);
  writeDb(db);

  res.json({
    success: true,
    message: 'উত্তরপত্র সফলভাবে জমা হয়েছে!',
    result: {
      submissionId: newSubmission.id,
      score: finalScore,
      totalMarks: totalQuestions,
      correctCount,
      wrongCount,
      skippedCount,
      percentage,
      isPassed,
      submittedAt: newSubmission.submittedAt
    }
  });
});

app.get('/api/exams/:id/leaderboard', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  const examSubmissions = (db.submissions || []).filter(s => String(s.examId) === String(id));

  examSubmissions.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return (a.timeSpent || 0) - (b.timeSpent || 0);
  });

  const leaderboard = examSubmissions.map((s, idx) => ({
    rank: idx + 1,
    roll: s.roll,
    name: s.name,
    score: s.score,
    totalMarks: s.totalMarks,
    percentage: s.percentage,
    timeSpent: s.timeSpent,
    submittedAt: s.submittedAt
  }));

  res.json({ success: true, count: leaderboard.length, leaderboard });
});

app.get('/api/exams/:id/review', (req, res) => {
  const { id } = req.params;
  const { roll } = req.query;

  if (!roll) return res.status(400).json({ success: false, message: 'রোল আবশ্যক।' });

  const db = readDb();
  const sub = (db.submissions || []).find(
    s => String(s.examId) === String(id) && String(s.roll).trim().toLowerCase() === String(roll).trim().toLowerCase()
  );

  if (!sub) return res.status(404).json({ success: false, message: 'উত্তরপত্র পাওয়া যায়নি।' });

  res.json({ success: true, submission: sub });
});

// 5. Admin Endpoints
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
  res.status(201).json({ success: true, message: `শিক্ষার্থী "${newStudent.name}" যুক্ত করা হয়েছে!`, student: newStudent });
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

app.get('/api/admin/exams', (req, res) => {
  const db = readDb();
  res.json({ success: true, exams: db.exams || [] });
});

app.post('/api/admin/exams', (req, res) => {
  const { title, group, duration, passingMarks, negativeMarking } = req.body;
  if (!title || !group) {
    return res.status(400).json({ success: false, message: 'পরীক্ষার নাম ও গ্রুপ আবশ্যক।' });
  }
  const db = readDb();
  if (!db.exams) db.exams = [];
  const newExam = {
    id: 'exam_' + Date.now(),
    title: String(title).trim(),
    group: String(group).trim().toLowerCase(),
    duration: Number(duration) || 30,
    passingMarks: Number(passingMarks) || 0,
    negativeMarking: Number(negativeMarking) || 0,
    questions: [],
    createdAt: new Date().toISOString()
  };
  db.exams.push(newExam);
  writeDb(db);
  res.status(201).json({ success: true, message: 'নতুন পরীক্ষা সফলভাবে তৈরি হয়েছে!', exam: newExam });
});

// 16b. Admin: Update exam details (Duration, Marks, etc.)
app.put('/api/admin/exams/:id', (req, res) => {
  const { id } = req.params;
  const { durationMinutes, duration, title, subject, totalMarks, passMarks, negativeMark } = req.body;

  const db = readDb();
  const exam = (db.exams || []).find(e => e.id === id);

  if (!exam) {
    return res.status(404).json({ success: false, message: 'পরীক্ষা খুঁজে পাওয়া যায়নি।' });
  }

  const newDuration = Number(durationMinutes || duration || exam.durationMinutes || exam.duration || 15);
  exam.durationMinutes = newDuration;
  exam.duration = newDuration;

  if (title) exam.title = String(title).trim();
  if (subject) exam.subject = String(subject).trim();
  if (passMarks !== undefined) exam.passMarks = Number(passMarks);
  if (negativeMark !== undefined) exam.negativeMark = Number(negativeMark);
  if (totalMarks !== undefined) exam.totalMarks = Number(totalMarks);

  writeDb(db);

  res.json({
    success: true,
    message: `পরীক্ষার সময় সফলভাবে ${newDuration} মিনিট আপডেট করা হয়েছে।`,
    exam
  });
});
app.delete('/api/admin/exams/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();
  db.exams = (db.exams || []).filter(e => String(e.id) !== String(id));
  writeDb(db);
  res.json({ success: true, message: 'পরীক্ষাটি মুছে ফেলা হয়েছে।' });
});

app.post('/api/admin/exams/:id/questions', (req, res) => {
  const { id } = req.params;
  const { question, options, correctAnswer, explanation } = req.body;
  if (!question || !Array.isArray(options) || options.length < 2 || correctAnswer === undefined) {
    return res.status(400).json({ success: false, message: 'প্রশ্ন, অপশন এবং সঠিক উত্তর আবশ্যক।' });
  }
  // Helper to fetch URL with redirects for Google Form
function fetchHttpUrl(targetUrl, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects === 0) return reject(new Error('অতিরিক্ত রিডাইরেক্ট হয়েছে।'));
    const protocol = targetUrl.startsWith('https') ? https : http;
    const req = protocol.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 9000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let nextUrl = res.headers.location;
        if (!nextUrl.startsWith('http')) {
          nextUrl = new URL(nextUrl, targetUrl).href;
        }
        return fetchHttpUrl(nextUrl, maxRedirects - 1).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('রিকোয়েস্ট টাইমআউট হয়েছে (সার্ভার রেসপন্স করেনি)।'));
    });
  });
}

function parseGoogleFormHtml(html) {
  const match = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[.+?\]);\s*<\/script>/s);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]);
    const title = (data[1] && (data[1][8] || data[1][0])) || 'Google Form Exam';
    const items = (data[1] && data[1][1]) || [];
    const questions = [];

    items.forEach((item, idx) => {
      const qText = item[1];
      const rawOptions = item[4] && item[4][0] && item[4][0][1];
      if (qText && Array.isArray(rawOptions) && rawOptions.length >= 2) {
        const options = rawOptions.map(opt => String(opt[0] || '').trim()).filter(Boolean);
        if (options.length >= 2) {
          questions.push({
            question: qText.trim(),
            options: options.slice(0, 4),
            correctIndex: 0,
            explanation: 'Google Form থেকে স্বয়ংক্রিয়ভাবে এক্সপোর্ট করা হয়েছে।'
          });
        }
      }
    });
    return { title, questions };
  } catch (e) {
    return null;
  }
}

function parseQuizRawText(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const questions = [];
  let currentQ = null;

  const qNumRegex = /^(\d+|[০-৯]+)[\.\:\-\)]\s*(.+)/;
  const optRegex = /^(\([a-dA-Dক-ঘ১-৪]\)|\[[a-dA-Dক-ঘ১-৪]\]|[a-dA-Dক-ঘ১-৪][\.\:\-\)\s])\s*(.+)/;
  const ansRegex = /^(ans|answer|উত্তর|সঠিক|সঠিক উত্তর)[\s\:\-\=]+([a-dA-D]|ক|খ|গ|ঘ|[১-৪]|1-4)/i;
  const expRegex = /^(explanation|ব্যাখ্যা|নোট)[\s\:\-\=]+(.+)/i;

  const charToIdx = {
    'a': 0, 'b': 1, 'c': 2, 'd': 3,
    'A': 0, 'B': 1, 'C': 2, 'D': 3,
    'ক': 0, 'খ': 1, 'গ': 2, 'ঘ': 3,
    '1': 0, '2': 1, '3': 2, '4': 3,
    '১': 0, '২': 1, '৩': 2, '৪': 3
  };

  for (let line of lines) {
    const qMatch = line.match(qNumRegex);
    const optMatch = line.match(optRegex);
    const ansMatch = line.match(ansRegex);
    const expMatch = line.match(expRegex);

    if (ansMatch && currentQ) {
      const char = ansMatch[2];
      if (charToIdx[char] !== undefined) {
        currentQ.correctIndex = charToIdx[char];
      }
    } else if (expMatch && currentQ) {
      currentQ.explanation = expMatch[2];
    } else if (optMatch && currentQ) {
      currentQ.options.push(optMatch[2]);
    } else if (qMatch) {
      if (currentQ && currentQ.options.length >= 2) {
        questions.push(currentQ);
      }
      currentQ = {
        question: qMatch[2],
        options: [],
        correctIndex: 0,
        explanation: 'Google Drive / Form থেকে সংগৃহীত।'
      };
    } else if (currentQ && currentQ.options.length === 0) {
      currentQ.question += ' ' + line;
    }
  }

  if (currentQ && currentQ.options.length >= 2) {
    questions.push(currentQ);
  }

  return questions;
}

 // 16b. Admin: Update exam details (Duration, Marks, etc.)
app.put('/api/admin/exams/:id', (req, res) => {
  const { id } = req.params;
  const { durationMinutes, duration, title, subject, totalMarks, passMarks, negativeMark } = req.body;

  const db = readDb();
  const exam = (db.exams || []).find(e => e.id === id);

  if (!exam) {
    return res.status(404).json({ success: false, message: 'পরীক্ষা খুঁজে পাওয়া যায়নি।' });
  }

  const newDuration = Number(durationMinutes || duration || exam.durationMinutes || exam.duration || 15);
  exam.durationMinutes = newDuration;
  exam.duration = newDuration;

  if (title) exam.title = String(title).trim();
  if (subject) exam.subject = String(subject).trim();
  if (passMarks !== undefined) exam.passMarks = Number(passMarks);
  if (negativeMark !== undefined) exam.negativeMark = Number(negativeMark);
  if (totalMarks !== undefined) exam.totalMarks = Number(totalMarks);

  writeDb(db);

  res.json({
    success: true,
    message: `পরীক্ষার সময় সফলভাবে ${newDuration} মিনিট আপডেট করা হয়েছে।`,
    exam
  });
}); 
// 18b. Admin: Parse Google Form URL, HTML, or raw text
app.post('/api/admin/parse-google-form', async (req, res) => {
  const { url, html, rawText } = req.body;

  try {
    if (url) {
      const cleanUrl = String(url).trim();
      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        return res.status(400).json({ success: false, message: 'সঠিক লিংক দিন (https://... দিয়ে শুরু হতে হবে)।' });
      }

      const fetchedHtml = await fetchHttpUrl(cleanUrl);
      const parsed = parseGoogleFormHtml(fetchedHtml);
      if (!parsed || parsed.questions.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Google Form থেকে কোনো বহুনির্বাচনী প্রশ্ন পাওয়া যায়নি। ফর্মটি পাবলিক আছে কিনা নিশ্চিত করুন অথবা মেথড ২ বা ৩ (HTML/টেক্সট পেস্ট) ব্যবহার করুন।'
        });
      }

      return res.json({
        success: true,
        source: 'google-form-url',
        title: parsed.title,
        questions: parsed.questions,
        totalFound: parsed.questions.length
      });
    }

    if (html) {
      const parsed = parseGoogleFormHtml(String(html));
      if (!parsed || parsed.questions.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'প্রদত্ত HTML কোডে Google Form-এর কোনো প্রশ্ন পাওয়া যায়নি।'
        });
      }

      return res.json({
        success: true,
        source: 'google-form-html',
        title: parsed.title,
        questions: parsed.questions,
        totalFound: parsed.questions.length
      });
    }

    if (rawText) {
      const parsedQuestions = parseQuizRawText(String(rawText));
      if (!parsedQuestions || parsedQuestions.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'টেক্সট থেকে কোনো প্রশ্ন ফরম্যাট শনাক্ত করা যায়নি। প্রশ্ন নম্বর (১., ২. বা 1., 2.) ও অপশন (ক, খ, গ, ঘ বা A, B, C, D) থাকা নিশ্চিত করুন।'
        });
      }

      return res.json({
        success: true,
        source: 'raw-text',
        title: 'ইমপোর্টকৃত মডেল টেস্ট',
        questions: parsedQuestions,
        totalFound: parsedQuestions.length
      });
    }

    return res.status(400).json({ success: false, message: 'Google Form লিংক, HTML অথবা প্রশ্নের টেক্সট প্রদান করুন।' });
  } catch (err) {
    console.error('Google form parse error:', err);
    res.status(500).json({ success: false, message: 'পার্সিংয়ে সমস্যা হয়েছে: ' + err.message });
  }
});

// 18c. Admin: Bulk add questions to exam
app.post('/api/admin/exams/:id/bulk-questions', (req, res) => {
  const { id } = req.params;
  const { questions } = req.body;

  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ success: false, message: 'যোগ করার মতো কোনো প্রশ্ন পাওয়া যায়নি।' });
  }

  const db = readDb();
  const exam = (db.exams || []).find(e => e.id === id);

  if (!exam) {
    return res.status(404).json({ success: false, message: 'পরীক্ষা খুঁজে পাওয়া যায়নি।' });
  }

  if (!Array.isArray(exam.questions)) exam.questions = [];

  let nextId = exam.questions.reduce((max, q) => Math.max(max, Number(q.id) || 0), 0) + 1;
  let addedCount = 0;

  for (const q of questions) {
    if (!q.question || !Array.isArray(q.options) || q.options.length < 2) continue;

    const cleanOptions = q.options.map(o => String(o).trim()).filter(Boolean);
    if (cleanOptions.length < 2) continue;

    let idx = Number(q.correctIndex);
    if (isNaN(idx) || idx < 0 || idx >= cleanOptions.length) {
      idx = 0;
    }

    exam.questions.push({
      id: nextId++,
      question: String(q.question).trim(),
      options: cleanOptions,
      correctIndex: idx,
      explanation: q.explanation ? String(q.explanation).trim() : 'কোনো ব্যাখ্যা দেওয়া হয়নি।'
    });
    addedCount++;
  }

  if (addedCount === 0) {
    return res.status(400).json({ success: false, message: 'কোনো বৈধ প্রশ্ন যুক্ত করা সম্ভব হয়নি।' });
  }

  exam.totalMarks = exam.questions.length;
  writeDb(db);

  res.status(201).json({
    success: true,
    message: `সফলভাবে ${addedCount}টি প্রশ্ন মড়েল টেস্টে যুক্ত করা হয়েছে!`,
    addedCount,
    totalQuestions: exam.questions.length,
    totalMarks: exam.totalMarks
  });
});
  const db = readDb();
  const exam = (db.exams || []).find(e => String(e.id) === String(id));
  if (!exam) return res.status(404).json({ success: false, message: 'পরীক্ষাটি পাওয়া যায়নি।' });
  if (!exam.questions) exam.questions = [];
  const newQ = {
    id: exam.questions.length + 1,
    question: String(question).trim(),
    options: options.map(o => String(o).trim()),
    correctAnswer: Number(correctAnswer),
    explanation: explanation ? String(explanation).trim() : ''
  };
  exam.questions.push(newQ);
  writeDb(db);
  res.status(201).json({ success: true, message: 'প্রশ্ন সফলভাবে যুক্ত হয়েছে!', question: newQ });
});

app.delete('/api/admin/exams/:id/questions/:questionId', (req, res) => {
  const { id, questionId } = req.params;
  const db = readDb();
  const exam = (db.exams || []).find(e => String(e.id) === String(id));
  if (!exam) return res.status(404).json({ success: false, message: 'পরীক্ষাটি পাওয়া যায়নি।' });
  exam.questions = (exam.questions || []).filter(q => String(q.id) !== String(questionId));
  writeDb(db);
  res.json({ success: true, message: 'প্রশ্নটি মুছে ফেলা হয়েছে।' });
});

app.get('/api/admin/submissions', (req, res) => {
  const db = readDb();
  res.json({ success: true, submissions: db.submissions || [] });
});
// ==========================================
// GOOGLE FORM & QUIZ TEXT PARSER UTILITIES
// ==========================================
function fetchHttpUrl(targetUrl, maxRedirects = 5) {
  const httpModule = targetUrl.startsWith('https:') ? https : http;
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('অতিরিক্ত রিডাইরেক্ট হয়েছে।'));
    const req = httpModule.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let nextUrl = res.headers.location;
        if (!nextUrl.startsWith('http')) {
          nextUrl = new URL(nextUrl, targetUrl).href;
        }
        return fetchHttpUrl(nextUrl, maxRedirects - 1).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('রিকোয়েস্ট টাইমআউট হয়েছে (সার্ভার রেসপন্স করেনি)।'));
    });
  });
}

function parseGoogleFormHtml(html) {
  const match = html.match(/FB_PUBLIC_LOAD_DATA_\s*=\s*(\[.+?\]);\s*<\/script>/s);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]);
    const title = (data[1] && (data[1][8] || data[1][0])) || 'Google Form Exam';
    const items = (data[1] && data[1][1]) || [];
    const questions = [];

    items.forEach((item) => {
      const qText = item[1];
      const rawOptions = item[4] && item[4][0] && item[4][0][1];
      if (qText && Array.isArray(rawOptions) && rawOptions.length >= 2) {
        const options = rawOptions.map(opt => String(opt[0] || '').trim()).filter(Boolean);
        if (options.length >= 2) {
          questions.push({
            question: qText.trim(),
            options: options.slice(0, 4),
            correctIndex: 0,
            correctAnswer: 0,
            explanation: 'Google Form থেকে স্বয়ংক্রিয়ভাবে এক্সপোর্ট করা হয়েছে।'
          });
        }
      }
    });
    return { title, questions };
  } catch (e) {
    return null;
  }
}

function parseQuizRawText(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const questions = [];
  let currentQ = null;

  const qNumRegex = /^(\d+|[০-৯]+)[\.\:\-\)]\s*(.+)/;
  const optRegex = /^(\([a-dA-Dক-ঘ১-৪]\)|\[[a-dA-Dক-ঘ১-৪]\]|[a-dA-Dক-ঘ১-৪][\.\:\-\)\s])\s*(.+)/;
  const ansRegex = /^(ans|answer|উত্তর|সঠিক|সঠিক উত্তর)[\s\:\-\=]+([a-dA-D]|ক|খ|গ|ঘ|[১-৪]|1-4)/i;
  const expRegex = /^(explanation|ব্যাখ্যা|নোট)[\s\:\-\=]+(.+)/i;

  const charToIdx = {
    'a': 0, 'b': 1, 'c': 2, 'd': 3,
    'A': 0, 'B': 1, 'C': 2, 'D': 3,
    'ক': 0, 'খ': 1, 'গ': 2, 'ঘ': 3,
    '1': 0, '2': 1, '3': 2, '4': 3,
    '১': 0, '২': 1, '৩': 2, '৪': 3
  };

  for (let line of lines) {
    const qMatch = line.match(qNumRegex);
    const optMatch = line.match(optRegex);
    const ansMatch = line.match(ansRegex);
    const expMatch = line.match(expRegex);

    if (ansMatch && currentQ) {
      const char = ansMatch[2];
      if (charToIdx[char] !== undefined) {
        currentQ.correctIndex = charToIdx[char];
        currentQ.correctAnswer = charToIdx[char];
      }
    } else if (expMatch && currentQ) {
      currentQ.explanation = expMatch[2];
    } else if (optMatch && currentQ) {
      currentQ.options.push(optMatch[2]);
    } else if (qMatch) {
      if (currentQ && currentQ.options.length >= 2) {
        questions.push(currentQ);
      }
      currentQ = {
        question: qMatch[2],
        options: [],
        correctIndex: 0,
        correctAnswer: 0,
        explanation: 'সংগৃহীত প্রশ্ন।'
      };
    } else if (currentQ && currentQ.options.length === 0) {
      currentQ.question += ' ' + line;
    }
  }

  if (currentQ && currentQ.options.length >= 2) {
    questions.push(currentQ);
  }

  return questions;
}

// 18b. Admin: Parse Google Form URL, HTML, or raw text
app.post('/api/admin/parse-google-form', async (req, res) => {
  const { url, html, rawText } = req.body;

  try {
    if (url) {
      const cleanUrl = String(url).trim();
      if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
        return res.status(400).json({ success: false, message: 'সঠিক লিংক দিন (https://... দিয়ে শুরু হতে হবে)।' });
      }

      const fetchedHtml = await fetchHttpUrl(cleanUrl);
      const parsed = parseGoogleFormHtml(fetchedHtml);
      if (!parsed || parsed.questions.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Google Form থেকে প্রশ্ন পাওয়া যায়নি। ফর্মটি পাবলিক আছে কিনা নিশ্চিত করুন অথবা মেথড ২ বা ৩ (HTML/টেক্সট পেস্ট) ব্যবহার করুন।'
        });
      }

      return res.json({
        success: true,
        source: 'google-form-url',
        title: parsed.title,
        questions: parsed.questions,
        totalFound: parsed.questions.length
      });
    }

    if (html) {
      const parsed = parseGoogleFormHtml(String(html));
      if (!parsed || parsed.questions.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'প্রদত্ত HTML কোডে Google Form-এর কোনো প্রশ্ন পাওয়া যায়নি।'
        });
      }

      return res.json({
        success: true,
        source: 'google-form-html',
        title: parsed.title,
        questions: parsed.questions,
        totalFound: parsed.questions.length
      });
    }

    if (rawText) {
      const parsedQuestions = parseQuizRawText(String(rawText));
      if (!parsedQuestions || parsedQuestions.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'টেক্সট থেকে কোনো প্রশ্ন ফরম্যাট শনাক্ত করা যায়নি। প্রশ্ন নম্বর (১., ২.) ও অপশন (ক, খ, গ, ঘ) থাকা নিশ্চিত করুন।'
        });
      }

      return res.json({
        success: true,
        source: 'raw-text',
        title: 'ইমপোর্টকৃত মডেল টেস্ট',
        questions: parsedQuestions,
        totalFound: parsedQuestions.length
      });
    }

    return res.status(400).json({ success: false, message: 'Google Form লিংক, HTML অথবা প্রশ্নের টেক্সট প্রদান করুন।' });
  } catch (err) {
    console.error('Google form parse error:', err);
    res.status(500).json({ success: false, message: 'পার্সিংয়ে সমস্যা হয়েছে: ' + err.message });
  }
});
// 18c. Admin: Bulk add questions to exam
app.post('/api/admin/exams/:id/bulk-questions', (req, res) => {
  const { id } = req.params;
  const { questions } = req.body;

  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ success: false, message: 'যোগ করার মতো কোনো প্রশ্ন পাওয়া যায়নি।' });
  }

  const db = readDb();
  const exam = (db.exams || []).find(e => e.id === id);

  if (!exam) {
    return res.status(404).json({ success: false, message: 'পরীক্ষা খুঁজে পাওয়া যায়নি।' });
  }

  if (!Array.isArray(exam.questions)) exam.questions = [];

  let nextId = exam.questions.reduce((max, q) => Math.max(max, Number(q.id) || 0), 0) + 1;
  let addedCount = 0;

  for (const q of questions) {
    if (!q.question || !Array.isArray(q.options) || q.options.length < 2) continue;

    const cleanOptions = q.options.map(o => String(o).trim()).filter(Boolean);
    if (cleanOptions.length < 2) continue;

    const rawIdx = q.correctIndex !== undefined ? q.correctIndex : q.correctAnswer;
    let idx = Number(rawIdx);
    if (isNaN(idx) || idx < 0 || idx >= cleanOptions.length) {
      idx = 0;
    }

    exam.questions.push({
      id: nextId++,
      question: String(q.question).trim(),
      options: cleanOptions,
      correctIndex: idx,
      correctAnswer: idx,
      explanation: q.explanation ? String(q.explanation).trim() : 'কোনো ব্যাখ্যা দেওয়া হয়নি।'
    });
    addedCount++;
  }

  if (addedCount === 0) {
    return res.status(400).json({ success: false, message: 'কোনো বৈধ প্রশ্ন যুক্ত করা সম্ভব হয়নি।' });
  }

  exam.totalMarks = exam.questions.length;
  writeDb(db);

  res.status(201).json({
    success: true,
    message: `সফলভাবে ${addedCount}টি প্রশ্ন মডেল টেস্টে যুক্ত করা হয়েছে!`,
    addedCount,
    totalQuestions: exam.questions.length,
    totalMarks: exam.totalMarks
  });
});
// ৮-ডিজিট রোল নম্বর তৈরির অ্যালগরিদম
function generate8DigitRoll(db, group, yearStr = '27') {
  const cleanGroup = String(group || 'science').trim().toLowerCase();
  let groupDigit = '1';
  if (cleanGroup === 'arts') groupDigit = '2';
  else if (cleanGroup === 'commerce') groupDigit = '3';

  const cleanYear = String(yearStr).replace(/[^0-9]/g, '').slice(-2) || '27';
  const prefix = `${groupDigit}${cleanYear}`; // যেমন: "127"

  const sameGroupYearRolls = (db.students || [])
    .filter(s => s.roll && String(s.roll).length === 8 && String(s.roll).startsWith(prefix))
    .map(s => {
      const serialPart = parseInt(String(s.roll).slice(3), 10);
      return isNaN(serialPart) ? 0 : serialPart;
    })
    .sort((a, b) => a - b);

  let nextSerial = 1001; // ব্যাচ ০১ (01) এবং সিরিয়াল ০০১ (001) => 01001
  if (sameGroupYearRolls.length > 0) {
    const maxSerial = sameGroupYearRolls[sameGroupYearRolls.length - 1];
    nextSerial = maxSerial + 1;
  }

  return `${prefix}${String(nextSerial).padStart(5, '0')}`;
}

// ১. স্টুডেন্ট রেজিস্ট্রেশন সাবমিট এন্ডপয়েন্ট
app.post('/api/registration/submit', (req, res) => {
  const { name, college, district, group, whatsapp, paymentMethod, paymentNumber, transactionId } = req.body;
  if (!name || !college || !district || !group || !whatsapp || !paymentNumber || !transactionId) {
    return res.status(400).json({ success: false, message: 'অনুগ্রহ করে সকল তথ্য সঠিকভাবে পূরণ করুন।' });
  }

  const cleanGroup = String(group).trim().toLowerCase();
  const cleanTrx = String(transactionId).trim().toUpperCase();
  const db = readDb();
  if (!Array.isArray(db.students)) db.students = [];

  // ইউনিক TrxID যাচাই
  const exists = db.students.find(s => s.transactionId && s.transactionId.toUpperCase() === cleanTrx);
  if (exists) {
    return res.status(409).json({ success: false, message: `এই ট্রানজেকশন আইডি (${cleanTrx}) ইতিমধ্যে ব্যবহৃত হয়েছে।` });
  }

  const newStudent = {
    id: `reg_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    roll: '',
    name: String(name).trim(),
    college: String(college).trim(),
    district: String(district).trim(),
    group: cleanGroup,
    whatsapp: String(whatsapp).trim(),
    paymentMethod: paymentMethod || 'bKash',
    paymentNumber: String(paymentNumber).trim(),
    transactionId: cleanTrx,
    status: 'pending',
    registeredAt: new Date().toISOString()
  };

  db.students.push(newStudent);
  writeDb(db);
  return res.status(201).json({ success: true, message: 'আবেদন জমা হয়েছে! এডমিন অনুমোদনের পর হোয়াটসঅ্যাপে রোল পাবেন।' });
});

// ২. স্ট্যাটাস যাচাই
app.get('/api/registration/check-status', (req, res) => {
  const { query } = req.query;
  const db = readDb();
  const q = String(query || '').trim().toLowerCase();
  const found = (db.students || []).find(s =>
    (s.whatsapp && s.whatsapp.toLowerCase() === q) ||
    (s.transactionId && s.transactionId.toLowerCase() === q) ||
    (s.roll && s.roll.toLowerCase() === q)
  );

  if (!found) return res.status(404).json({ success: false, message: 'কোনো শিক্ষার্থী পাওয়া যায়নি।' });
  return res.json({ success: true, student: found });
});


// ৩. প্রিভিউ ৮-ডিজিট রোল
app.get('/api/admin/students/preview-roll', (req, res) => {
  const { group, year } = req.query;
  const db = readDb();
  const roll = generate8DigitRoll(db, group || 'science', year || '27');
  res.json({ success: true, roll });
});

// ৪. এডমিন অনুমোদন ও ৮-ডিজিট রোল বরাদ্দ
app.put('/api/admin/students/:identifier/approve', (req, res) => {
  const { identifier } = req.params;
  const { customRoll } = req.body || {};
  const db = readDb();
  const student = (db.students || []).find(s => (s.id && s.id === identifier) || (s.roll && s.roll === identifier));
  if (!student) return res.status(404).json({ success: false, message: 'শিক্ষার্থী পাওয়া যায়নি।' });

  student.roll = customRoll ? String(customRoll).trim() : generate8DigitRoll(db, student.group, '27');
  student.status = 'approved';
  student.approvedAt = new Date().toISOString();
  writeDb(db);

  return res.json({ success: true, message: 'অনুমোদিত হয়েছে!', student });
});
// 12.5. Admin: Approve student registration (Generates 8-Digit Unique Roll automatically)
app.put('/api/admin/students/:identifier/approve', (req, res) => {
  const { identifier } = req.params;
  const { customRoll, year } = req.body || {};
  const db = readDb();

  const cleanId = String(identifier).trim().toLowerCase();
  const student = (db.students || []).find(
    s => (s.id && String(s.id).trim().toLowerCase() === cleanId) ||
         (s.roll && String(s.roll).trim().toLowerCase() === cleanId) ||
         (s.transactionId && String(s.transactionId).trim().toLowerCase() === cleanId) ||
         (s.whatsapp && String(s.whatsapp).trim().toLowerCase() === cleanId)
  );

  if (!student) {
    return res.status(404).json({ success: false, message: 'শিক্ষার্থী পাওয়া যায়নি।' });
  }

  // Determine final 8-digit unique roll
  let finalRoll = '';
  if (customRoll && String(customRoll).trim()) {
    finalRoll = String(customRoll).trim();
  } else if (student.roll && String(student.roll).trim().length === 8) {
    finalRoll = String(student.roll).trim();
  } else {
    finalRoll = generate8DigitRoll(db, student.group || 'science', year || '27');
  }

  // Check if roll is already assigned to someone else
  const duplicate = (db.students || []).find(
    s => s !== student && s.roll && String(s.roll).trim().toLowerCase() === finalRoll.toLowerCase()
  );

  if (duplicate) {
    return res.status(409).json({
      success: false,
      message: `রোল "${finalRoll}" ইতিমধ্যে শিক্ষার্থী "${duplicate.name}" (${(duplicate.group || '').toUpperCase()}) এর জন্য বরাদ্দ আছে। অন্য একটি রোল দিন।`
    });
  }

  student.id = student.id || `std_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  student.roll = String(finalRoll).trim();
  student.status = 'approved';
  student.approvedAt = new Date().toISOString();

  writeDb(db);

  return res.json({
    success: true,
    message: `শিক্ষার্থী "${student.name}" কে সফলভাবে অনুমোদন (Approve) করা হয়েছে! বরাদ্দকৃত ইউনিক রোল নম্বর: ${finalRoll}`,
    student
  });
});

// ৫. WhatsApp সেন্ড রেকর্ড
app.post('/api/admin/students/:identifier/record-whatsapp-sent', (req, res) => {
  const { identifier } = req.params;
  const db = readDb();
  const student = (db.students || []).find(s => (s.id && s.id === identifier) || (s.roll && s.roll === identifier));
  if (student) {
    student.whatsappSent = true;
    student.whatsappSentAt = new Date().toISOString();
    writeDb(db);
  }
  return res.json({ success: true });
});

// 11.6. Admin: Sync/Import multiple students safely
app.post('/api/admin/students/sync', (req, res) => {
  const { students } = req.body;
  if (!Array.isArray(students)) {
    return res.status(400).json({ success: false, message: 'শিক্ষার্থীদের তালিকা সঠিক নয়।' });
  }

  const db = readDb();
  if (!Array.isArray(db.students)) db.students = [];

  // Update or merge the persistent student list without losing any student fields
  const existingKeys = new Set();
  db.students.forEach(s => {
    if (s.id) existingKeys.add(String(s.id).trim().toLowerCase());
    if (s.roll) existingKeys.add(String(s.roll).trim().toLowerCase());
    if (s.transactionId) existingKeys.add(String(s.transactionId).trim().toUpperCase());
  });

  let addedCount = 0;

  students.forEach(s => {
    if (!s || !s.name) return;
    const cleanId = s.id ? String(s.id).trim().toLowerCase() : '';
    const cleanRoll = s.roll ? String(s.roll).trim().toLowerCase() : '';
    const cleanTrx = s.transactionId ? String(s.transactionId).trim().toUpperCase() : '';

    const alreadyExists = (cleanId && existingKeys.has(cleanId)) ||
                          (cleanRoll && existingKeys.has(cleanRoll)) ||
                          (cleanTrx && existingKeys.has(cleanTrx));

    if (!alreadyExists) {
      const mergedStudent = {
        id: s.id || `std_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
        roll: s.roll ? String(s.roll).trim() : '',
        name: String(s.name).trim(),
        college: s.college ? String(s.college).trim() : '',
        district: s.district ? String(s.district).trim() : '',
        group: String(s.group || 'science').trim().toLowerCase(),
        whatsapp: s.whatsapp ? String(s.whatsapp).trim() : '',
        paymentMethod: s.paymentMethod ? String(s.paymentMethod).trim() : 'bKash',
        paymentNumber: s.paymentNumber ? String(s.paymentNumber).trim() : '',
        transactionId: s.transactionId ? String(s.transactionId).trim().toUpperCase() : '',
        status: s.status || (s.roll ? 'approved' : 'pending'),
        registeredAt: s.registeredAt || new Date().toISOString(),
        approvedAt: s.approvedAt || (s.status === 'approved' ? new Date().toISOString() : undefined),
        whatsappSent: !!s.whatsappSent,
        whatsappSentAt: s.whatsappSentAt || undefined
      };

      db.students.push(mergedStudent);
      if (mergedStudent.id) existingKeys.add(mergedStudent.id.toLowerCase());
      if (mergedStudent.roll) existingKeys.add(mergedStudent.roll.toLowerCase());
      if (mergedStudent.transactionId) existingKeys.add(mergedStudent.transactionId.toUpperCase());
      addedCount++;
    }
  });

  writeDb(db);

  return res.json({
    success: true,
    message: `${addedCount} জন নতুন শিক্ষার্থী সফলভাবে সংরক্ষিত হয়েছে।`,
    totalStudents: db.students.length,
    students: db.students
  });
});
// ৬. আবেদন বাতিল
app.put('/api/admin/students/:identifier/reject', (req, res) => {
  const { identifier } = req.params;
  const { reason } = req.body || {};
  const db = readDb();
  const student = (db.students || []).find(s => (s.id && s.id === identifier) || (s.roll && s.roll === identifier));
  if (!student) return res.status(404).json({ success: false, message: 'শিক্ষার্থী পাওয়া যায়নি।' });

  student.status = 'rejected';
  student.rejectReason = reason || 'ভুল তথ্য';
  student.rejectedAt = new Date().toISOString();
  writeDb(db);
  return res.json({ success: true, message: 'আবেদন বাতিল করা হয়েছে।' });
});
// Serve static frontend files
app.use(express.static(__dirname, { extensions: ['html'] }));

app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST}:${PORT}`);
});
