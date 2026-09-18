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
// Automatically commits data/database.json to the GitHub repository so Render never loses data!
let isSyncingToGitHub = false;
let pendingGitHubSync = false;

async function triggerGitHubSync(data) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const repo = process.env.GITHUB_REPO || 'nucrackers/nucrackers';
  const branch = process.env.GITHUB_BRANCH || 'main';
  const filePath = 'data/database.json';

  if (!token) {
    // If no GitHub Token is provided, local fs write succeeded
    return;
  }

  if (isSyncingToGitHub) {
    pendingGitHubSync = true;
    return;
  }

  isSyncingToGitHub = true;
  pendingGitHubSync = false;

  try {
    console.log(`[GitHub Sync] Starting auto-commit to ${repo} on branch ${branch}...`);
    const contentStr = JSON.stringify(data, null, 2);
    const contentBase64 = Buffer.from(contentStr).toString('base64');

    // 1. Get current file SHA from GitHub API
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
      console.warn('[GitHub Sync] File does not exist yet or fetch failed:', fetchErr.message);
    }

    // 2. Put / Commit the updated file directly to GitHub
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
      const putData = await putRes.json();
      console.log(`[GitHub Sync] Successfully committed database.json to GitHub! Commit: ${putData.commit?.sha?.slice(0, 7)}`);
    } else {
      const errText = await putRes.text();
      console.error('[GitHub Sync] Failed to commit to GitHub:', putRes.status, errText);
    }
  } catch (err) {
    console.error('[GitHub Sync] Unexpected error syncing to GitHub:', err);
  } finally {
    isSyncingToGitHub = false;
    if (pendingGitHubSync) {
      setTimeout(() => triggerGitHubSync(readDb()), 3000);
    }
  }
}

// ==========================================
// API ROUTES
// ==========================================

// 1. Student Login via Unique Roll and Name
app.post('/api/auth/login', (req, res) => {
  const { roll, name } = req.body;
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

  // Check approval status: New registrations must be approved by admin!
  const status = student.status || 'approved';
  if (status === 'pending') {
    return res.status(403).json({
      success: false,
      pendingApproval: true,
      message: `আপনার রোলটি (${student.name} - রোল: ${student.roll}) এখনো এডমিন দ্বারা অনুমোদিত (Approve) হয়নি। এডমিন অনুমোদন করার পর আপনি প্রবেশ করতে পারবেন।`
    });
  }

  // Determine redirect page strictly based on group
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

// ==========================================
// 8-DIGIT UNIQUE ROLL GENERATOR (ACCORDING TO USER FORMULA)
// 1st digit: Group (1 = Science, 2 = Arts, 3 = Commerce)
// 2nd & 3rd digits: Current Year (e.g. 27 for batch 2027)
// 4th & 5th digits: Batch number (01 for first 100 students, 02 for next 100...)
// 6th-8th digits: Serial number (001 to 100)
// Total length: Exactly 8 characters (e.g. 12701001)
// ==========================================
function generate8DigitRoll(db, group, customYear = '27') {
  const groupCodeMap = {
    science: '1',
    arts: '2',
    commerce: '3'
  };
  const gCode = groupCodeMap[String(group).toLowerCase()] || '1';
  const yearCode = String(customYear).slice(-2);
  const prefix = `${gCode}${yearCode}`;

  const existingRolls = new Set(
    (db.students || [])
      .map(s => String(s.roll || '').trim())
      .filter(r => r.length === 8 && r.startsWith(prefix))
  );

  let seq = 1;
  while (true) {
    const batchNum = Math.floor((seq - 1) / 100) + 1;
    const batchStr = String(batchNum).padStart(2, '0');
    const serialInBatch = ((seq - 1) % 100) + 1;
    const serialStr = String(serialInBatch).padStart(3, '0');
    const roll = `${prefix}${batchStr}${serialStr}`;

    if (!existingRolls.has(roll)) {
      return roll;
    }
    seq++;
  }
}

// 2. New Student Admission Registration (Pending Section)
app.post(['/api/registration/submit', '/api/students/register'], (req, res) => {
  const {
    name,
    college,
    district,
    group,
    whatsapp,
    paymentMethod,
    paymentNumber,
    transactionId
  } = req.body;

  if (!name || !college || !district || !group || !whatsapp || !paymentMethod || !paymentNumber || !transactionId) {
    return res.status(400).json({
      success: false,
      message: 'সবগুলো তথ্য (নাম, কলেজ, জেলা, বিভাগ, হোয়াটসঅ্যাপ নম্বর, পেমেন্ট মেথড, প্রেরক নম্বর ও TrxID) সঠিকভাবে পূরণ করুন।'
    });
  }

  const cleanName = String(name).trim();
  const cleanCollege = String(college).trim();
  const cleanDistrict = String(district).trim();
  const cleanGroup = String(group).trim().toLowerCase();
  const cleanWhatsapp = String(whatsapp).trim();
  const cleanPaymentMethod = String(paymentMethod).trim();
  const cleanPaymentNumber = String(paymentNumber).trim();
  const cleanTransactionId = String(transactionId).trim().toUpperCase();

  if (!['science', 'arts', 'commerce'].includes(cleanGroup)) {
    return res.status(400).json({ success: false, message: 'গ্রুপ অবশ্যই Science, Arts অথবা Commerce হতে হবে।' });
  }

  const db = readDb();
  if (!Array.isArray(db.students)) db.students = [];

  // Check if this Transaction ID is already submitted
  const existingTrx = db.students.find(s =>
    s.transactionId && String(s.transactionId).trim().toUpperCase() === cleanTransactionId
  );
  if (existingTrx) {
    return res.status(409).json({
      success: false,
      message: `এই ট্রানজেকশন আইডি (${cleanTransactionId}) দিয়ে ইতিমধ্যে একটি আবেদন করা হয়েছে (${existingTrx.name})। আপনার আবেদনের বর্তমান অবস্থা জানতে "স্ট্যাটাস যাচাই" করুন।`
    });
  }

  // Generate a registration ID for pending student until admin approves & assigns 8-digit roll
  const newStudent = {
    id: `reg_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    roll: '', // Auto-assigned 8-digit unique roll upon admin approval
    name: cleanName,
    college: cleanCollege,
    district: cleanDistrict,
    group: cleanGroup,
    whatsapp: cleanWhatsapp,
    paymentMethod: cleanPaymentMethod,
    paymentNumber: cleanPaymentNumber,
    transactionId: cleanTransactionId,
    status: 'pending',
    registeredAt: new Date().toISOString()
  };

  db.students.push(newStudent);
  writeDb(db);

  return res.status(201).json({
    success: true,
    message: 'আপনার ভর্তি আবেদনটি সফলভাবে জমা হয়েছে! এডমিন খুব শীঘ্রই আপনার পেমেন্ট যাচাই করে ৮-ডিজিটের অফিসিয়াল রোল নম্বর প্রদান করবেন।',
    registration: newStudent
  });
});

// 2.5. Check Student Registration & Roll Status
app.get('/api/registration/check-status', (req, res) => {
  const { query } = req.query;
  if (!query || !String(query).trim()) {
    return res.status(400).json({ success: false, message: 'অনুসন্ধানের জন্য হোয়াটসঅ্যাপ নম্বর, TrxID অথবা রোল নম্বর লিখুন।' });
  }

  const cleanQuery = String(query).trim().toLowerCase();
  const db = readDb();
  const students = db.students || [];

  const found = students.find(s =>
    (s.whatsapp && String(s.whatsapp).trim().toLowerCase() === cleanQuery) ||
    (s.transactionId && String(s.transactionId).trim().toLowerCase() === cleanQuery) ||
    (s.roll && String(s.roll).trim().toLowerCase() === cleanQuery) ||
    (s.id && String(s.id).trim().toLowerCase() === cleanQuery)
  );

  if (!found) {
    return res.status(404).json({
      success: false,
      message: 'প্রদত্ত তথ্য দিয়ে কোনো আবেদন বা শিক্ষার্থী পাওয়া যায়নি। অনুগ্রহ করে নম্বর বা TrxID ঠিকভাবে লিখুন।'
    });
  }

  return res.json({
    success: true,
    student: {
      name: found.name,
      college: found.college || '',
      district: found.district || '',
      group: found.group,
      whatsapp: found.whatsapp || '',
      paymentMethod: found.paymentMethod || '',
      paymentNumber: found.paymentNumber || '',
      transactionId: found.transactionId || '',
      status: found.status || 'approved',
      roll: found.roll || '',
      registeredAt: found.registeredAt,
      approvedAt: found.approvedAt
    }
  });
});

// Backward-compatible student registration endpoint
app.post('/api/auth/register', (req, res) => {
  const { roll, name, group, college, district, whatsapp, paymentMethod, paymentNumber, transactionId } = req.body;
  if (!name || !group) {
    return res.status(400).json({ success: false, message: 'নাম এবং গ্রুপ সঠিকভাবে পূরণ করুন।' });
  }

  const cleanName = String(name).trim();
  const cleanGroup = String(group).trim().toLowerCase();
  const cleanRoll = roll ? String(roll).trim() : '';

  if (!['science', 'arts', 'commerce'].includes(cleanGroup)) {
    return res.status(400).json({ success: false, message: 'গ্রুপ অবশ্যই Science, Arts অথবা Commerce হতে হবে।' });
  }

  const db = readDb();
  if (!Array.isArray(db.students)) db.students = [];

  if (cleanRoll) {
    const existing = db.students.find(s => String(s.roll).trim().toLowerCase() === cleanRoll.toLowerCase());
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `রোল নম্বর "${cleanRoll}" ইতিমধ্যে রেজিস্টার করা আছে।`
      });
    }
  }

  const newStudent = {
    id: `reg_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    roll: cleanRoll,
    name: cleanName,
    college: college ? String(college).trim() : '',
    district: district ? String(district).trim() : '',
    group: cleanGroup,
    whatsapp: whatsapp ? String(whatsapp).trim() : '',
    paymentMethod: paymentMethod ? String(paymentMethod).trim() : 'bKash',
    paymentNumber: paymentNumber ? String(paymentNumber).trim() : '',
    transactionId: transactionId ? String(transactionId).trim().toUpperCase() : '',
    status: 'pending',
    registeredAt: new Date().toISOString()
  };

  db.students.push(newStudent);
  writeDb(db);

  return res.status(201).json({
    success: true,
    pendingApproval: true,
    message: `আপনার রেজিস্ট্রেশন সফল হয়েছে! এডমিন অনুমোদনের পর আপনি ৮-ডিজিট রোল পাবেন।`,
    student: newStudent
  });
});

// 3. List Registered Students (for quick testing/reference)
app.get('/api/students', (req, res) => {
  const db = readDb();
  const list = db.students.map(s => ({
    roll: s.roll,
    name: s.name,
    group: s.group,
    status: s.status || 'approved'
  }));
  res.json({ success: true, count: list.length, students: list });
});

// 4. Get Exams by Group & Batch Type
app.get('/api/exams', (req, res) => {
  const { group, roll, type, isFree, studentName } = req.query;
  const db = readDb();

  let exams = db.exams || [];

  // Filter by Free or Premium if specified
  if (type === 'free' || isFree === 'true') {
    exams = exams.filter(e => e.isFree === true || e.batch === 'free');
  } else if (type === 'premium') {
    exams = exams.filter(e => !e.isFree && e.batch !== 'free');
  }

  // Filter by group if specified
  if (group && group.toLowerCase() !== 'all') {
    exams = exams.filter(e => e.group.toLowerCase() === group.toLowerCase() || e.group.toLowerCase() === 'all');
  }

  // Sanitize exams so correct answers and explanations are not leaked
  const sanitized = exams.map(e => {
    // Check if current roll or student name already submitted
    let userSubmission = null;
    if (roll) {
      userSubmission = (db.submissions || []).find(
        s => s.examId === e.id && String(s.roll).trim().toLowerCase() === String(roll).trim().toLowerCase()
      );
    }
    if (!userSubmission && studentName) {
      userSubmission = (db.submissions || []).find(
        s => s.examId === e.id && String(s.name).trim().toLowerCase() === String(studentName).trim().toLowerCase()
      );
    }

    const duration = Number(e.durationMinutes || e.duration || 15);
    const totalMarks = Number(e.totalMarks !== undefined && e.totalMarks !== null ? e.totalMarks : (e.questions ? e.questions.length : 0));
    const isExamFree = e.isFree === true || e.batch === 'free';

    return {
      id: e.id,
      group: e.group,
      batch: e.batch || (isExamFree ? 'free' : 'premium'),
      isFree: isExamFree,
      title: e.title,
      subject: e.subject,
      durationMinutes: duration,
      duration: duration,
      totalMarks: totalMarks,
      passMarks: Number(e.passMarks || 5),
      negativeMark: e.negativeMark || 0,
      status: e.status || 'live',
      description: e.description,
      questionCount: (e.questions || []).length,
      hasSubmitted: !!userSubmission,
      lastScore: userSubmission ? userSubmission.score : null
    };
  });

  res.json({ success: true, exams: sanitized });
});

// 5. Get Single Exam Details & Questions for Taking (NO correct answers sent!)
app.get('/api/exams/:id', (req, res) => {
  const { id } = req.params;
  const { roll } = req.query;
  const db = readDb();
  const exam = (db.exams || []).find(e => e.id === id);

  if (!exam) {
    return res.status(404).json({ success: false, message: 'পরীক্ষা পাওয়া যায়নি।' });
  }

  const isExamFree = exam.isFree === true || exam.batch === 'free';

  // Group permission verification ONLY for premium exams with roll
  if (!isExamFree && roll) {
    const student = (db.students || []).find(s => String(s.roll).trim().toLowerCase() === String(roll).trim().toLowerCase());
    if (student) {
      if (student.status === 'pending') {
        return res.status(403).json({
          success: false,
          message: 'আপনার অ্যাকাউন্টটি এখনো এডমিন দ্বারা অনুমোদিত হয়নি। অনুগ্রহ করে অনুমোদনের অপেক্ষা করুন।'
        });
      }
      if (student.group !== exam.group && exam.group !== 'all') {
        return res.status(403).json({
          success: false,
          message: `প্রবেশাধিকার সংরক্ষিত! আপনি ${student.group.toUpperCase()} ইউনিটের শিক্ষার্থী। ${exam.group.toUpperCase()} ইউনিটের পরীক্ষা দেখতে পারবেন না।`
        });
      }
    }
  }

  // Strip answers for taking test
  const safeQuestions = (exam.questions || []).map(q => ({
    id: q.id,
    question: q.question,
    options: q.options
  }));

  res.json({
    success: true,
    exam: {
      id: exam.id,
      group: exam.group,
      batch: exam.batch || (isExamFree ? 'free' : 'premium'),
      isFree: isExamFree,
      title: exam.title,
      subject: exam.subject,
      durationMinutes: Number(exam.durationMinutes || exam.duration || 15),
      duration: Number(exam.duration || exam.durationMinutes || 15),
      totalMarks: Number(exam.totalMarks !== undefined && exam.totalMarks !== null ? exam.totalMarks : (exam.questions ? exam.questions.length : 0)),
      passMarks: Number(exam.passMarks || 5),
      negativeMark: exam.negativeMark || 0,
      status: exam.status || 'live',
      description: exam.description,
      questions: safeQuestions
    }
  });
});

// 6. Submit Exam (Supports both Free Batch with Name/College and Premium with Roll)
app.post('/api/exams/:id/submit', (req, res) => {
  const { id } = req.params;
  const { roll, studentName, collegeName, answers, timeTakenSeconds } = req.body;

  const db = readDb();
  const exam = (db.exams || []).find(e => e.id === id);
  if (!exam) {
    return res.status(404).json({ success: false, message: 'পরীক্ষা পাওয়া যায়নি।' });
  }

  const isExamFree = exam.isFree === true || exam.batch === 'free';
  let finalRoll = '';
  let finalName = '';
  let finalCollege = '';
  let finalGroup = exam.group || 'all';

  if (isExamFree) {
    // For free exams, student enters Name & College name
    finalName = String(studentName || req.body.name || '').trim();
    finalCollege = String(collegeName || req.body.college || '').trim() || 'কলেজ উল্লেখ নেই';
    if (!finalName) {
      return res.status(400).json({ success: false, message: 'পরীক্ষা জমা দেওয়ার জন্য আপনার নাম আবশ্যক।' });
    }
    finalRoll = roll ? String(roll).trim() : `FREE-${Date.now().toString().slice(-4)}`;
  } else {
    // For premium exams, roll is strictly required & checked
    if (!roll) {
      return res.status(400).json({ success: false, message: 'রোল নম্বর প্রয়োজন।' });
    }

    const student = (db.students || []).find(s => String(s.roll).trim().toLowerCase() === String(roll).trim().toLowerCase());
    if (!student) {
      return res.status(401).json({
        success: false,
        message: 'প্রিমিয়াম শিক্ষার্থী তালিকায় রোল পাওয়া যায়নি। অনুগ্রহ করে সঠিক রোল ও নাম দিয়ে লগইন করুন।'
      });
    }

    if (student.status === 'pending') {
      return res.status(403).json({
        success: false,
        message: 'আপনার রেজিস্ট্রেশনটি এখনো এডমিন দ্বারা অনুমোদিত হয়নি।'
      });
    }

    if (student.group !== exam.group && exam.group !== 'all') {
      return res.status(403).json({
        success: false,
        message: `প্রবেশাধিকার সংরক্ষিত! আপনি ${student.group.toUpperCase()} ইউনিটের শিক্ষার্থী। ${exam.group.toUpperCase()} ইউনিটের পরীক্ষায় অংশগ্রহণ করার অনুমতি নেই।`
      });
    }

    finalName = student.name;
    finalCollege = student.college || '';
    finalRoll = student.roll;
    finalGroup = student.group;
  }

const negativeMark = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let skippedCount = 0;
    let rawScore = 0;

    // এই লাইনটি জরুরি (যাতে userAnswers ডিফাইন থাকে):
    const userAnswers = answers || {};

    (exam.questions || []).forEach(q => {
      const chosen = userAnswers[q.id];
      const target = q.correctIndex !== undefined ? q.correctIndex : q.correctAnswer;
      if (chosen === undefined || chosen === null || chosen === -1 || chosen === '') {
        skippedCount++;
      } else if (target !== undefined && Number(chosen) === Number(target)) {
        correctCount++;
        rawScore += 1;
      } else {
        wrongCount++;
        // ভুল উত্তরের জন্য কোনো মার্ক কাটা যাবে না
      }
    });

    const finalScore = Math.max(0, Number(rawScore.toFixed(2)));
    const totalQuestions = (exam.questions || []).length;
    const totalMarks = Number(exam.totalMarks !== undefined && exam.totalMarks !== null ? exam.totalMarks : totalQuestions);
    const passMarks = Number(exam.passMarks || 5);

    const submission = {
      id: 'sub-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      examId: exam.id,
      isFree: isExamFree,
      roll: finalRoll,
      name: finalName,
      college: finalCollege,
      group: finalGroup,
      score: finalScore,
      totalMarks: totalMarks,
      passMarks: passMarks,
      correctCount,
      wrongCount,
      skippedCount,
      timeTakenSeconds: Number(timeTakenSeconds) || 0,
      answers: userAnswers,
      submittedAt: new Date().toISOString()
    };

  // Remove previous submission if student retakes this exam
  db.submissions = (db.submissions || []).filter(
    s => !(s.examId === exam.id && (
      (finalRoll && String(s.roll).trim().toLowerCase() === String(finalRoll).trim().toLowerCase()) ||
      (isExamFree && String(s.name).trim().toLowerCase() === String(finalName).trim().toLowerCase())
    ))
  );
  db.submissions.push(submission);
  writeDb(db);

  // Compute Rank for this exam
  const examSubmissions = db.submissions
    .filter(s => s.examId === exam.id)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.timeTakenSeconds || 0) - (b.timeTakenSeconds || 0);
    });

  const myRank = examSubmissions.findIndex(s => s.id === submission.id) + 1;

  res.json({
    success: true,
    message: 'পরীক্ষা সফলভাবে জমা নেওয়া হয়েছে!',
    result: {
      submissionId: submission.id,
      examId: exam.id,
      examTitle: exam.title,
      isFree: isExamFree,
      roll: submission.roll,
      name: submission.name,
      college: submission.college,
      score: finalScore,
      totalMarks: totalMarks,
      passMarks: passMarks,
      isPassed: finalScore >= passMarks,
      correctCount,
      wrongCount,
      skippedCount,
      timeTakenSeconds: submission.timeTakenSeconds,
      rank: myRank,
      totalParticipants: examSubmissions.length
    }
  });
});

// 7. Leaderboard for an Exam
app.get('/api/exams/:id/leaderboard', (req, res) => {
  const { id } = req.params;
  const { currentRoll, currentName } = req.query;
  const db = readDb();

  const exam = (db.exams || []).find(e => e.id === id);
  if (!exam) {
    return res.status(404).json({ success: false, message: 'পরীক্ষা পাওয়া যায়নি।' });
  }

  const isExamFree = exam.isFree === true || exam.batch === 'free';

  const examSubmissions = (db.submissions || [])
    .filter(s => s.examId === id)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (Number(a.timeTakenSeconds) || 0) - (Number(b.timeTakenSeconds) || 0);
    });

  const leaderboard = examSubmissions.map((s, index) => {
    const student = (db.students || []).find(st => String(st.roll).trim().toLowerCase() === String(s.roll).trim().toLowerCase());
    const studentName = s.name || (student && student.name) || (s.roll ? `শিক্ষার্থী (${s.roll})` : 'সাধারণ শিক্ষার্থী');
    const studentCollege = s.college || (student && student.college) || '';
    const studentGroup = (student && student.group) || s.group || exam.group || '';
    const timeInSec = Number(s.timeTakenSeconds !== undefined ? s.timeTakenSeconds : (s.timeSpent !== undefined ? s.timeSpent : 0)) || 0;

    let isCurrent = false;
    if (currentRoll && String(s.roll).trim().toLowerCase() === String(currentRoll).trim().toLowerCase()) {
      isCurrent = true;
    } else if (currentName && String(studentName).trim().toLowerCase() === String(currentName).trim().toLowerCase()) {
      isCurrent = true;
    }

    return {
      rank: index + 1,
      roll: s.roll,
      name: studentName,
      college: studentCollege,
      group: studentGroup,
      score: s.score,
      totalMarks: s.totalMarks,
      correctCount: s.correctCount,
      wrongCount: s.wrongCount,
      skippedCount: s.skippedCount,
      timeTakenSeconds: timeInSec,
      submittedAt: s.submittedAt,
      isCurrentStudent: isCurrent
    };
  });

  res.json({
    success: true,
    examTitle: exam.title,
    isFree: isExamFree,
    totalParticipants: leaderboard.length,
    leaderboard
  });
});

// 8. Detailed Review / Solve Sheet with Correct Answers & Explanations
app.get('/api/exams/:id/review', (req, res) => {
  const { id } = req.params;
  const { roll, name, submissionId } = req.query;

  const db = readDb();
  const exam = (db.exams || []).find(e => e.id === id);
  if (!exam) {
    return res.status(404).json({ success: false, message: 'পরীক্ষা পাওয়া যায়নি।' });
  }

  const isExamFree = exam.isFree === true || exam.batch === 'free';

  // Locate submission if available
  let submission = null;
  if (submissionId) {
    submission = (db.submissions || []).find(s => s.id === submissionId);
  }
  if (!submission && roll) {
    submission = (db.submissions || []).find(
      s => s.examId === id && String(s.roll).trim().toLowerCase() === String(roll).trim().toLowerCase()
    );
  }
  if (!submission && name) {
    submission = (db.submissions || []).find(
      s => s.examId === id && String(s.name).trim().toLowerCase() === String(name).trim().toLowerCase()
    );
  }

  // If not free exam and no submission, require roll
  if (!isExamFree && !submission) {
    return res.status(404).json({ success: false, message: 'আপনি এই পরীক্ষায় এখনো অংশগ্রহণ করেননি।' });
  }

  const userAnswers = (submission && submission.answers) || {};

  const reviewQuestions = (exam.questions || []).map(q => {
    const chosenIndex = userAnswers[q.id] !== undefined ? userAnswers[q.id] : null;
    const isSkipped = chosenIndex === null || chosenIndex === -1 || chosenIndex === '';
    const isCorrect = !isSkipped && Number(chosenIndex) === q.correctIndex;

    return {
      id: q.id,
      question: q.question,
      options: q.options,
      chosenIndex,
      correctIndex: q.correctIndex,
      isCorrect,
      isSkipped,
      explanation: q.explanation || 'কোনো অতিরিক্ত ব্যাখ্যা দেওয়া নেই।'
    };
  });

  const totalQ = (exam.questions || []).length;
  const totalMarks = Number(exam.totalMarks !== undefined && exam.totalMarks !== null ? exam.totalMarks : totalQ);

  res.json({
    success: true,
    examTitle: exam.title,
    examSubject: exam.subject,
    isFree: isExamFree,
    student: {
      roll: submission ? submission.roll : (roll || ''),
      name: submission ? submission.name : (name || 'সাধারণ শিক্ষার্থী'),
      college: submission ? submission.college : ''
    },
    summary: {
      score: submission ? submission.score : 0,
      totalMarks: totalMarks,
      correctCount: submission ? submission.correctCount : 0,
      wrongCount: submission ? submission.wrongCount : 0,
      skippedCount: submission ? submission.skippedCount : 0,
      timeTakenSeconds: submission ? submission.timeTakenSeconds : 0,
      submittedAt: submission ? submission.submittedAt : new Date().toISOString()
    },
    questions: reviewQuestions
  });
});

// ==========================================
// ADMIN API ENDPOINTS
// ==========================================

const ADMIN_PASSWORDS = [
  'Nucrackers#.com',
  'nucrackers#.com',
  'Nucrackers#.com ',
  '"Nucrackers#.com"',
  'Nucrackers.com',
  'admin123'
];

// 9. Admin Login verification
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ success: false, message: 'এডমিন পাসওয়ার্ড প্রদান করুন।' });
  }

  const cleanPass = String(password).trim().replace(/^["']|["']$/g, ''); // strip outer quotes if copied with quotes

  const isValid = ADMIN_PASSWORDS.some(p => p.toLowerCase() === cleanPass.toLowerCase() || p === String(password).trim());

  if (isValid) {
    return res.json({
      success: true,
      message: 'এডমিন লগইন সফল হয়েছে!',
      token: 'nu-admin-authorized-token'
    });
  }

  return res.status(401).json({
    success: false,
    message: 'ভুল এডমিন পাসওয়ার্ড! পাসওয়ার্ডটি হলো: Nucrackers#.com'
  });
});

// 10. Admin Overview Stats
app.get('/api/admin/stats', (req, res) => {
  const db = readDb();
  const students = db.students || [];
  const exams = db.exams || [];
  const submissions = db.submissions || [];

  const scienceCount = students.filter(s => s.group === 'science').length;
  const artsCount = students.filter(s => s.group === 'arts').length;
  const commerceCount = students.filter(s => s.group === 'commerce').length;
  const pendingCount = students.filter(s => s.status === 'pending').length;
  const approvedCount = students.filter(s => s.status !== 'pending').length;

  let totalQuestions = 0;
  exams.forEach(ex => {
    totalQuestions += (ex.questions || []).length;
  });

  res.json({
    success: true,
    stats: {
      totalStudents: students.length,
      pendingCount,
      approvedCount,
      scienceCount,
      artsCount,
      commerceCount,
      totalExams: exams.length,
      totalQuestions,
      totalSubmissions: submissions.length
    }
  });
});

// 11. Admin: Get all students
app.get('/api/admin/students', (req, res) => {
  const db = readDb();
  res.json({
    success: true,
    students: db.students || []
  });
});

// 11.5. Admin: Synchronize/Restore students (Prevents data loss on Render ephemeral filesystem restarts)
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

  if (addedCount > 0) {
    writeDb(db);
  }

  return res.json({
    success: true,
    message: `ডাটাবেজ সিঙ্ক সফল! ${addedCount} জন শিক্ষার্থী পুনরুদ্ধার/যুক্ত করা হয়েছে।`,
    totalStudents: db.students.length,
    students: db.students
  });
});

// 11.6. Admin: Force overwrite entire student list (When deletions or reorders need full sync)
app.put('/api/admin/students/bulk-replace', (req, res) => {
  const { students } = req.body;
  if (!Array.isArray(students)) {
    return res.status(400).json({ success: false, message: 'শিক্ষার্থীদের তালিকা সঠিক নয়।' });
  }

  const db = readDb();
  db.students = students.map((s, idx) => ({
    id: s.id || `std_${Date.now()}_${idx}`,
    roll: s.roll ? String(s.roll).trim() : '',
    name: String(s.name || 'শিক্ষার্থী').trim(),
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
  }));

  writeDb(db);

  return res.json({
    success: true,
    message: 'শিক্ষার্থী তালিকা সফলভাবে আপডেট ও সংরক্ষিত করা হয়েছে।',
    totalStudents: db.students.length,
    students: db.students
  });
});

// 11.8. Admin: Preview next 8-Digit Unique Roll for a group
app.get('/api/admin/students/preview-roll', (req, res) => {
  const { group, year } = req.query;
  const db = readDb();
  const cleanGroup = String(group || 'science').trim().toLowerCase();
  const generatedRoll = generate8DigitRoll(db, cleanGroup, year || '27');
  return res.json({
    success: true,
    group: cleanGroup,
    roll: generatedRoll
  });
});
// Google Sheet Webhook Settings
app.get('/api/admin/google-sheet-settings', (req, res) => {
  const db = readDb();
  res.json({
    success: true,
    webhookUrl: (db.settings && db.settings.googleSheetWebhookUrl) || ''
  });
});

app.post('/api/admin/google-sheet-settings', (req, res) => {
  const { webhookUrl } = req.body;
  const db = readDb();
  db.settings = db.settings || {};
  db.settings.googleSheetWebhookUrl = (webhookUrl || '').trim();
  writeDb(db);
  res.json({
    success: true,
    message: 'গুগল শিট Webhook URL সফলভাবে সেভ করা হয়েছে!',
    webhookUrl: db.settings.googleSheetWebhookUrl
  });
});

// Sync Approved Students to Google Sheet
app.post('/api/admin/sync-google-sheet', async (req, res) => {
  try {
    const db = readDb();
    const webhookUrl = (req.body.webhookUrl || (db.settings && db.settings.googleSheetWebhookUrl) || '').trim();

    if (!webhookUrl) {
      return res.status(400).json({
        success: false,
        message: 'গুগল শিট Webhook URL সেট করা নেই। অনুগ্রহ করে প্রথমে Webhook URL দিন।'
      });
    }

    const approvedStudents = (db.students || [])
      .filter(s => s.status === 'approved' || !!s.roll)
      .map(s => ({
        roll: s.roll || '',
        name: s.name || '',
        college: s.college || '',
        district: s.district || '',
        group: s.group || '',
        whatsapp: s.whatsapp || '',
        paymentMethod: s.paymentMethod || '',
        senderNumber: s.paymentNumber || '',
        transactionId: s.transactionId || '',
        approvedAt: s.approvedAt || s.registeredAt || ''
      }));

    if (approvedStudents.length === 0) {
      return res.json({
        success: true,
        message: 'কোনো অনুমোদিত শিক্ষার্থী নেই সিঙ্ক করার জন্য।',
        count: 0
      });
    }

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'syncApprovedStudents',
        timestamp: new Date().toISOString(),
        totalStudents: approvedStudents.length,
        students: approvedStudents
      })
    });

    res.json({
      success: true,
      message: `মোট ${approvedStudents.length} জন অনুমোদিত শিক্ষার্থীর তথ্য গুগল শিটে সফলভাবে সিঙ্ক হয়েছে!`,
      count: approvedStudents.length
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: `গুগল শিট সিঙ্ক করার সময় ত্রুটি: ${err.message}`
    });
  }
});
// 12. Admin: Add new student with STRICT UNIQUE ROLL validation (Supports auto 8-digit generation)
app.post('/api/admin/students', (req, res) => {
  const { roll, name, group, college, district, whatsapp } = req.body;

  if (!name || !group) {
    return res.status(400).json({
      success: false,
      message: 'শিক্ষার্থীর নাম এবং গ্রুপ আবশ্যক।'
    });
  }

  const cleanName = String(name).trim();
  const cleanGroup = String(group).trim().toLowerCase();

  if (!['science', 'arts', 'commerce'].includes(cleanGroup)) {
    return res.status(400).json({
      success: false,
      message: 'গ্রুপ অবশ্যই Science, Arts অথবা Commerce নির্বাচন করতে হবে।'
    });
  }

  const db = readDb();
  if (!Array.isArray(db.students)) db.students = [];

  let cleanRoll = roll ? String(roll).trim() : '';

  // If no roll is supplied, auto-generate 8-digit unique roll
  if (!cleanRoll) {
    cleanRoll = generate8DigitRoll(db, cleanGroup, '27');
  }

  // Strict Unique Roll check
  const duplicate = db.students.find(
    s => s.roll && String(s.roll).trim().toLowerCase() === cleanRoll.toLowerCase()
  );

  if (duplicate) {
    return res.status(409).json({
      success: false,
      message: `রোল "${cleanRoll}" ইতিমধ্যে ব্যবহৃত হচ্ছে! এই রোলে শিক্ষার্থী "${duplicate.name}" (${(duplicate.group || '').toUpperCase()}) রয়েছেন। রোল অবশ্যই ইউনিক হতে হবে।`
    });
  }

  const newStudent = {
    id: `admin_std_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    roll: cleanRoll,
    name: cleanName,
    college: college ? String(college).trim() : '',
    district: district ? String(district).trim() : '',
    group: cleanGroup,
    whatsapp: whatsapp ? String(whatsapp).trim() : '',
    status: 'approved', // Admin added students are automatically approved
    registeredAt: new Date().toISOString(),
    approvedAt: new Date().toISOString()
  };

  db.students.push(newStudent);
  writeDb(db);

  return res.status(201).json({
    success: true,
    message: `শিক্ষার্থী "${cleanName}" (রোল: ${cleanRoll}) সফলভাবে অনুমোদিত তালিকায় যুক্ত হয়েছে!`,
    student: newStudent
  });
});

// 12.5. Admin: Approve student registration (Generates 8-Digit Unique Roll automatically)
// Supports all legacy and current routes, PUT and POST
app.all([
  '/api/admin/students/:identifier/approve',
  '/api/students/:identifier/approve',
  '/api/registration/:identifier/approve',
  '/api/students/approve',
  '/api/admin/students/approve'
], (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const identifier = req.params.identifier || req.body.identifier || req.body.id || req.body.roll || req.body.transactionId;
  const { customRoll, year } = req.body || {};
  const db = readDb();

  if (!identifier) {
    return res.status(400).json({ success: false, message: 'শিক্ষার্থীর আইডেন্টিফায়ার প্রদান করা হয়নি।' });
  }

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
    message: `শিক্ষার্থী "${student.name}" কে সফলভাবে অনুমোদন (Approve) করা হয়েছে! বরাদ্দকৃত ইউনিক রোল নম্বর: ${student.roll}`,
    student
  });
});

// 12.5.1. Admin: Record WhatsApp notification status
app.all([
  '/api/admin/students/:identifier/record-whatsapp-sent',
  '/api/students/:identifier/record-whatsapp-sent',
  '/api/students/record-whatsapp-sent'
], (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const identifier = req.params.identifier || req.body.identifier || req.body.id || req.body.roll;
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

  student.whatsappSent = true;
  student.whatsappSentAt = new Date().toISOString();
  writeDb(db);

  return res.json({
    success: true,
    message: 'হোয়াটসঅ্যাপ মেসেজ রেকর্ড সফলভাবে আপডেট হয়েছে।',
    student
  });
});

// 12.6. Admin: Reject student registration
app.all([
  '/api/admin/students/:identifier/reject',
  '/api/students/:identifier/reject',
  '/api/students/reject'
], (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const identifier = req.params.identifier || req.body.identifier || req.body.id || req.body.roll;
  const { reason } = req.body || {};
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

  student.status = 'rejected';
  student.rejectReason = reason || 'অসম্পূর্ণ বা ভুল তথ্য';
  student.rejectedAt = new Date().toISOString();

  writeDb(db);

  return res.json({
    success: true,
    message: `শিক্ষার্থী "${student.name}" এর আবেদন বাতিল করা হয়েছে।`,
    student
  });
});

// 13. Admin: Update student details
app.put('/api/admin/students/:identifier', (req, res) => {
  const { identifier } = req.params;
  const { name, group, roll, college, district, whatsapp } = req.body;

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

  if (name) student.name = String(name).trim();
  if (roll) student.roll = String(roll).trim();
  if (college) student.college = String(college).trim();
  if (district) student.district = String(district).trim();
  if (whatsapp) student.whatsapp = String(whatsapp).trim();
  if (group && ['science', 'arts', 'commerce'].includes(group.toLowerCase())) {
    student.group = group.toLowerCase();
  }

  writeDb(db);
  return res.json({
    success: true,
    message: 'শিক্ষার্থীর তথ্য সফলভাবে আপডেট করা হয়েছে।',
    student
  });
});

// 14. Admin: Delete student
app.delete('/api/admin/students/:identifier', (req, res) => {
  const { identifier } = req.params;
  const db = readDb();

  const cleanId = String(identifier).trim().toLowerCase();
  const initialLength = (db.students || []).length;
  db.students = (db.students || []).filter(
    s => !( (s.id && String(s.id).trim().toLowerCase() === cleanId) ||
            (s.roll && String(s.roll).trim().toLowerCase() === cleanId) ||
            (s.transactionId && String(s.transactionId).trim().toLowerCase() === cleanId) ||
            (s.whatsapp && String(s.whatsapp).trim().toLowerCase() === cleanId) )
  );

  if (db.students.length === initialLength) {
    return res.status(404).json({ success: false, message: 'মুছে ফেলার জন্য শিক্ষার্থী পাওয়া যায়নি।' });
  }

  writeDb(db);
  return res.json({
    success: true,
    message: `শিক্ষার্থীর রেকর্ড সফলভাবে মুছে ফেলা হয়েছে।`
  });
});

// 15. Admin: Get all exams (with full questions)
app.get('/api/admin/exams', (req, res) => {
  const db = readDb();
  const exams = (db.exams || []).map(e => ({
    ...e,
    durationMinutes: Number(e.durationMinutes || e.duration || 15),
    duration: Number(e.duration || e.durationMinutes || 15),
    totalMarks: Number(e.totalMarks !== undefined && e.totalMarks !== null ? e.totalMarks : (e.questions ? e.questions.length : 0))
  }));
  res.json({
    success: true,
    exams
  });
});

// 16. Admin: Create new exam
app.post('/api/admin/exams', (req, res) => {
  const { id, group, batch, isFree, title, subject, durationMinutes, totalMarks, passMarks, negativeMark, description } = req.body;

  if (!title || !group || !subject) {
    return res.status(400).json({ success: false, message: 'পরীক্ষার নাম, গ্রুপ ও বিষয় আবশ্যক।' });
  }

  const cleanGroup = String(group).trim().toLowerCase();
  if (!['science', 'arts', 'commerce', 'all'].includes(cleanGroup)) {
    return res.status(400).json({ success: false, message: 'গ্রুপ Science, Arts, Commerce বা All হতে হবে।' });
  }

  const db = readDb();
  if (!Array.isArray(db.exams)) db.exams = [];

  const examBatch = (batch === 'free' || isFree === true) ? 'free' : 'premium';
  const isExamFree = examBatch === 'free';
  const prefix = isExamFree ? 'free' : cleanGroup.slice(0, 3);

  const examId = id ? String(id).trim().toLowerCase().replace(/\s+/g, '-') : `${prefix}-${cleanGroup.slice(0, 3)}-${Date.now()}`;

  // Check unique exam ID
  if (db.exams.some(e => e.id === examId)) {
    return res.status(409).json({ success: false, message: 'এই আইডির পরীক্ষা ইতিমধ্যে বিদ্যমান।' });
  }

  const rawDuration = Number(durationMinutes || req.body.duration || 15);
  const rawTotalMarks = totalMarks !== undefined && totalMarks !== null ? Number(totalMarks) : 0;

  const newExam = {
    id: examId,
    group: cleanGroup,
    batch: examBatch,
    isFree: isExamFree,
    title: String(title).trim(),
    subject: String(subject).trim(),
    durationMinutes: rawDuration,
    duration: rawDuration,
    totalMarks: rawTotalMarks,
    passMarks: Number(passMarks) || 5,
   negativeMark: 0,
    status: 'live',
    description: description ? String(description).trim() : '',
    questions: []
  };

  db.exams.push(newExam);
  writeDb(db);

  res.status(201).json({
    success: true,
    message: `নতুন ${isExamFree ? 'ফ্রি ব্যাচের' : 'প্রিমিয়াম'} পরীক্ষা সফলভাবে তৈরি হয়েছে!`,
    exam: newExam
  });
});

// 16b. Admin: Update exam details (e.g. Duration, Title, Marks, Batch)
app.put('/api/admin/exams/:id', (req, res) => {
  const { id } = req.params;
  const { durationMinutes, duration, title, subject, totalMarks, passMarks, negativeMark, description, group, batch, isFree } = req.body;

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
  if (group) exam.group = String(group).trim().toLowerCase();
  if (batch !== undefined || isFree !== undefined) {
    exam.batch = (batch === 'free' || isFree === true) ? 'free' : 'premium';
    exam.isFree = exam.batch === 'free';
  }
  if (description !== undefined) exam.description = String(description).trim();
  if (passMarks !== undefined) exam.passMarks = Number(passMarks);
   exam.negativeMark = 0;
  if (totalMarks !== undefined) exam.totalMarks = Number(totalMarks);

  writeDb(db);

  res.json({
    success: true,
    message: `পরীক্ষার তথ্য সফলভাবে আপডেট করা হয়েছে (${newDuration} মিনিট)।`,
    exam
  });
});

// 17. Admin: Delete exam
app.delete('/api/admin/exams/:id', (req, res) => {
  const { id } = req.params;
  const db = readDb();

  const initialLength = (db.exams || []).length;
  db.exams = (db.exams || []).filter(e => e.id !== id);

  if (db.exams.length === initialLength) {
    return res.status(404).json({ success: false, message: 'পরীক্ষা খুঁজে পাওয়া যায়নি।' });
  }

  // Also remove submissions for this exam
  db.submissions = (db.submissions || []).filter(s => s.examId !== id);

  writeDb(db);
  res.json({ success: true, message: 'পরীক্ষা ও এর যাবতীয় ফলাফল মুছে ফেলা হয়েছে।' });
});

// 18. Admin: Add question to an exam
app.post('/api/admin/exams/:id/questions', (req, res) => {
  const { id } = req.params;
  const { question, options, correctIndex, correctAnswer, explanation } = req.body;

  if (!question || typeof question !== 'string' || !question.trim()) {
    return res.status(400).json({ success: false, message: 'প্রশ্নের বিবরণ লিখুন।' });
  }

  if (!Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ success: false, message: 'কমপক্ষে ৪টি বিকল্প অপশন থাকতে হবে।' });
  }

  const cleanOptions = options.map(o => String(o).trim()).filter(Boolean);
  if (cleanOptions.length < 2) {
    return res.status(400).json({ success: false, message: 'অপশনগুলো সঠিকভাবে পূরণ করুন।' });
  }

  const rawCorrect = correctIndex !== undefined ? correctIndex : correctAnswer;
  const idx = Number(rawCorrect);
  if (isNaN(idx) || idx < 0 || idx >= cleanOptions.length) {
    return res.status(400).json({ success: false, message: 'সঠিক উত্তর অপশন নির্বাচন করুন।' });
  }

  const db = readDb();
  const exam = (db.exams || []).find(e => e.id === id);

  if (!exam) {
    return res.status(404).json({ success: false, message: 'পরীক্ষা খুঁজে পাওয়া যায়নি।' });
  }

  if (!Array.isArray(exam.questions)) exam.questions = [];

  // Determine next question ID
  const maxId = exam.questions.reduce((max, q) => Math.max(max, Number(q.id) || 0), 0);
  const newQuestion = {
    id: maxId + 1,
    question: question.trim(),
    options: cleanOptions,
    correctIndex: idx,
    correctAnswer: idx,
    explanation: explanation ? explanation.trim() : 'কোনো ব্যাখ্যা প্রদান করা হয়নি।'
  };

  exam.questions.push(newQuestion);
  exam.totalMarks = exam.questions.length; // auto adjust total marks to question count

  writeDb(db);

  res.status(201).json({
    success: true,
    message: 'প্রশ্নটি সফলভাবে পরীক্ষায় যুক্ত করা হয়েছে!',
    question: newQuestion,
    totalQuestions: exam.questions.length,
    totalMarks: exam.totalMarks
  });
});

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
    message: `সফলভাবে ${addedCount}টি প্রশ্ন মড়েল টেস্টে যুক্ত করা হয়েছে!`,
    addedCount,
    totalQuestions: exam.questions.length,
    totalMarks: exam.totalMarks
  });
});

// 19. Admin: Delete question from an exam
app.delete('/api/admin/exams/:id/questions/:questionId', (req, res) => {
  const { id, questionId } = req.params;
  const db = readDb();

  const exam = (db.exams || []).find(e => e.id === id);
  if (!exam) {
    return res.status(404).json({ success: false, message: 'পরীক্ষা খুঁজে পাওয়া যায়নি।' });
  }

  const qIdNum = Number(questionId);
  const initialLength = (exam.questions || []).length;
  exam.questions = (exam.questions || []).filter(q => Number(q.id) !== qIdNum);

  if (exam.questions.length === initialLength) {
    return res.status(404).json({ success: false, message: 'প্রশ্নটি পাওয়া যায়নি।' });
  }

  exam.totalMarks = Math.max(1, exam.questions.length);
  writeDb(db);

  res.json({
    success: true,
    message: 'প্রশ্নটি সফলভাবে মুছে ফেলা হয়েছে!',
    remainingQuestions: exam.questions.length
  });
});

// 20. Admin: View all submissions / audit
app.get('/api/admin/submissions', (req, res) => {
  const db = readDb();
  res.json({
    success: true,
    submissions: (db.submissions || []).slice().reverse()
  });
});

// 21. Overall System Info / Hosting Status
app.get('/api/system/info', (req, res) => {
  const db = readDb();
  res.json({
    appName: 'NU Crackers Premium Exam Portal',
    status: 'online',
    totalStudents: (db.students || []).length,
    totalExams: (db.exams || []).length,
    totalSubmissions: (db.submissions || []).length,
    hosting: {
      provider: 'Google Cloud Run (AI Studio)',
      customDomainSupported: true
    }
  });
});

// Explicit 404 for unhandled API endpoints so it NEVER returns HTML
app.all('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API Route not found: ${req.method} ${req.path}`
  });
});

// ==========================================
// STATIC ASSET SERVING
// ==========================================
app.use(express.static(__dirname, {
  extensions: ['html', 'htm'],
  index: 'index.html'
}));

// Fallback to index.html ONLY for non-API frontend page navigation
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, message: 'API Route not found' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`NU Crackers server listening on http://${HOST}:${PORT}`);
});
