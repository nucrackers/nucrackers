import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;
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

// Helper to write DB safely
function writeDb(data) {
  try {
    const dir = path.dirname(DB_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error writing database:', err);
    return false;
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
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ success: false, message: 'অনুগ্রহ করে শিক্ষার্থীর নাম প্রদান করুন।' });
  }

  const cleanRoll = roll.trim();
  const cleanName = name.trim();
  const db = readDb();
  const student = db.students.find(s => String(s.roll).trim().toLowerCase() === cleanRoll.toLowerCase());

  if (!student) {
    return res.status(404).json({
      success: false,
      message: `রোল "${cleanRoll}"-এর কোনো শিক্ষার্থী প্রিমিয়াম তালিকায় পাওয়া যায়নি। সঠিক রোল লিখুন অথবা নতুন রোল রেজিস্টার করুন।`
    });
  }

  // Verify Name matches (case-insensitive fuzzy match)
  const registeredName = (student.name || '').trim().toLowerCase();
  const inputName = cleanName.toLowerCase();
  if (registeredName && !registeredName.includes(inputName) && !inputName.includes(registeredName)) {
    return res.status(401).json({
      success: false,
      message: `রোল "${cleanRoll}" এর জন্য নাম মেলেনি। নথিভুক্ত নাম অনুযায়ী সঠিক নাম লিখুন।`
    });
  }

  // Check approval status: New registrations must be approved by admin!
  const status = student.status || 'approved';
  if (status === 'pending') {
    return res.status(403).json({
      success: false,
      pendingApproval: true,
      message: `আপনার রেজিস্ট্রেশনটি (${student.name} - রোল: ${student.roll}) এখনো এডমিন দ্বারা অনুমোদিত (Approve) হয়নি। এডমিন অনুমোদন করার পর আপনি প্রবেশ করতে পারবেন।`
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

// 2. Student Registration / Roll Enrollment (Requires Admin Approval)
app.post('/api/auth/register', (req, res) => {
  const { roll, name, group } = req.body;
  if (!roll || !name || !group) {
    return res.status(400).json({ success: false, message: 'নাম, রোল নম্বর এবং গ্রুপ সঠিকভাবে পূরণ করুন।' });
  }

  const cleanRoll = String(roll).trim();
  const cleanName = String(name).trim();
  const cleanGroup = String(group).trim().toLowerCase();

  if (!['science', 'arts', 'commerce'].includes(cleanGroup)) {
    return res.status(400).json({ success: false, message: 'গ্রুপ অবশ্যই Science, Arts অথবা Commerce হতে হবে।' });
  }

  const db = readDb();
  const existing = db.students.find(s => String(s.roll).trim().toLowerCase() === cleanRoll.toLowerCase());
  if (existing) {
    return res.status(409).json({
      success: false,
      message: `রোল নম্বর "${cleanRoll}" ইতিমধ্যে রেজিস্টার করা আছে (${existing.name} - ${existing.group.toUpperCase()})। যদি এটি আপনার রোল হয়, রোল ও নাম দিয়ে লগইন করুন।`
    });
  }

  // Newly registered students start with status 'pending' until Admin approves!
  const newStudent = {
    roll: cleanRoll,
    name: cleanName,
    group: cleanGroup,
    status: 'pending',
    registeredAt: new Date().toISOString()
  };

  db.students.push(newStudent);
  writeDb(db);

  return res.status(201).json({
    success: true,
    pendingApproval: true,
    message: `আপনার রেজিস্ট্রেশন সফল হয়েছে! নিরাপত্তার স্বার্থে এডমিন অনুমোদনের (Approve) জন্য অপেক্ষারত রয়েছে। এডমিন অ্যাপ্রুভ করার সাথে সাথে আপনি রোল ও নাম দিয়ে সরাসরি প্রবেশ করতে পারবেন।`,
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

// 4. Get Exams by Group
app.get('/api/exams', (req, res) => {
  const { group, roll } = req.query;
  const db = readDb();

  let exams = db.exams || [];
  if (group) {
    exams = exams.filter(e => e.group.toLowerCase() === group.toLowerCase());
  }

  // Sanitize exams so correct answers and explanations are not leaked
  const sanitized = exams.map(e => {
    // Check if current roll already submitted
    let userSubmission = null;
    if (roll) {
      userSubmission = (db.submissions || []).find(
        s => s.examId === e.id && String(s.roll).trim().toLowerCase() === String(roll).trim().toLowerCase()
      );
    }

    return {
      id: e.id,
      group: e.group,
      title: e.title,
      subject: e.subject,
      durationMinutes: e.durationMinutes,
      totalMarks: e.totalMarks,
      passMarks: e.passMarks,
      negativeMark: e.negativeMark || 0,
      status: e.status,
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

  // Group permission verification
  if (roll) {
    const student = db.students.find(s => String(s.roll).trim().toLowerCase() === String(roll).trim().toLowerCase());
    if (student) {
      if (student.status === 'pending') {
        return res.status(403).json({
          success: false,
          message: 'আপনার অ্যাকাউন্টটি এখনো এডমিন দ্বারা অনুমোদিত হয়নি। অনুগ্রহ করে অনুমোদনের অপেক্ষা করুন।'
        });
      }
      if (student.group !== exam.group) {
        return res.status(403).json({
          success: false,
          message: `প্রবেশাধিকার সংরক্ষিত! আপনি ${student.group.toUpperCase()} ইউনিটের শিক্ষার্থী। ${exam.group.toUpperCase()} ইউনিটের পরীক্ষা দেখতে পারবেন না।`
        });
      }
    }
  }

  // Strip answers
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
      title: exam.title,
      subject: exam.subject,
      durationMinutes: exam.durationMinutes,
      totalMarks: exam.totalMarks,
      passMarks: exam.passMarks,
      negativeMark: exam.negativeMark || 0,
      status: exam.status,
      description: exam.description,
      questions: safeQuestions
    }
  });
});

// 6. Submit Exam
app.post('/api/exams/:id/submit', (req, res) => {
  const { id } = req.params;
  const { roll, answers, timeTakenSeconds } = req.body;

  if (!roll) {
    return res.status(400).json({ success: false, message: 'রোল নম্বর প্রয়োজন।' });
  }

  const db = readDb();
  const exam = (db.exams || []).find(e => e.id === id);
  if (!exam) {
    return res.status(404).json({ success: false, message: 'পরীক্ষা পাওয়া যায়নি।' });
  }

  const student = db.students.find(s => String(s.roll).trim().toLowerCase() === String(roll).trim().toLowerCase());
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

  // Strict group isolation: e.g. Science students cannot submit Arts/Commerce exams
  if (student.group !== exam.group) {
    return res.status(403).json({
      success: false,
      message: `প্রবেশাধিকার সংরক্ষিত! আপনি ${student.group.toUpperCase()} ইউনিটের শিক্ষার্থী। ${exam.group.toUpperCase()} ইউনিটের পরীক্ষায় অংশগ্রহণ করার অনুমতি নেই।`
    });
  }

  const studentName = student.name;
  const studentGroup = student.group;

  const negativeMark = exam.negativeMark || 0;
  let correctCount = 0;
  let wrongCount = 0;
  let skippedCount = 0;
  let rawScore = 0;

  const userAnswers = answers || {};

  (exam.questions || []).forEach(q => {
    const chosen = userAnswers[q.id];
    if (chosen === undefined || chosen === null || chosen === -1) {
      skippedCount++;
    } else if (Number(chosen) === q.correctIndex) {
      correctCount++;
      rawScore += 1;
    } else {
      wrongCount++;
      rawScore -= negativeMark;
    }
  });

  const finalScore = Math.max(0, Number(rawScore.toFixed(2)));

  const submission = {
    id: 'sub-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
    examId: exam.id,
    roll: String(roll).trim(),
    name: studentName,
    group: studentGroup,
    score: finalScore,
    totalMarks: exam.totalMarks,
    passMarks: exam.passMarks,
    correctCount,
    wrongCount,
    skippedCount,
    timeTakenSeconds: Number(timeTakenSeconds) || 0,
    answers: userAnswers,
    submittedAt: new Date().toISOString()
  };

  // Remove previous submission if student retakes or update
  db.submissions = (db.submissions || []).filter(
    s => !(s.examId === exam.id && String(s.roll).trim().toLowerCase() === String(roll).trim().toLowerCase())
  );
  db.submissions.push(submission);
  writeDb(db);

  // Compute Rank for this exam
  const examSubmissions = db.submissions
    .filter(s => s.examId === exam.id)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.timeTakenSeconds - b.timeTakenSeconds;
    });

  const myRank = examSubmissions.findIndex(s => s.id === submission.id) + 1;

  res.json({
    success: true,
    message: 'পরীক্ষা সফলভাবে জমা নেওয়া হয়েছে!',
    result: {
      submissionId: submission.id,
      examId: exam.id,
      examTitle: exam.title,
      roll: submission.roll,
      name: submission.name,
      score: finalScore,
      totalMarks: exam.totalMarks,
      passMarks: exam.passMarks,
      isPassed: finalScore >= exam.passMarks,
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
  const { currentRoll } = req.query;
  const db = readDb();

  const exam = (db.exams || []).find(e => e.id === id);
  if (!exam) {
    return res.status(404).json({ success: false, message: 'পরীক্ষা পাওয়া যায়নি।' });
  }

  const examSubmissions = (db.submissions || [])
    .filter(s => s.examId === id)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.timeTakenSeconds - b.timeTakenSeconds;
    });

  const leaderboard = examSubmissions.map((s, index) => ({
    rank: index + 1,
    roll: s.roll,
    name: s.name,
    group: s.group,
    score: s.score,
    totalMarks: s.totalMarks,
    correctCount: s.correctCount,
    wrongCount: s.wrongCount,
    timeTakenSeconds: s.timeTakenSeconds,
    submittedAt: s.submittedAt,
    isCurrentStudent: currentRoll ? String(s.roll).trim().toLowerCase() === String(currentRoll).trim().toLowerCase() : false
  }));

  res.json({
    success: true,
    examTitle: exam.title,
    totalParticipants: leaderboard.length,
    leaderboard
  });
});

// 8. Detailed Review with Correct Answers & Explanations
app.get('/api/exams/:id/review', (req, res) => {
  const { id } = req.params;
  const { roll } = req.query;

  if (!roll) {
    return res.status(400).json({ success: false, message: 'রোল নম্বর প্রয়োজন।' });
  }

  const db = readDb();
  const exam = (db.exams || []).find(e => e.id === id);
  if (!exam) {
    return res.status(404).json({ success: false, message: 'পরীক্ষা পাওয়া যায়নি।' });
  }

  const submission = (db.submissions || []).find(
    s => s.examId === id && String(s.roll).trim().toLowerCase() === String(roll).trim().toLowerCase()
  );

  if (!submission) {
    return res.status(404).json({ success: false, message: 'আপনি এই পরীক্ষায় এখনো অংশগ্রহণ করেননি।' });
  }

  const userAnswers = submission.answers || {};

  const reviewQuestions = (exam.questions || []).map(q => {
    const chosenIndex = userAnswers[q.id] !== undefined ? userAnswers[q.id] : null;
    const isSkipped = chosenIndex === null || chosenIndex === -1;
    const isCorrect = !isSkipped && Number(chosenIndex) === q.correctIndex;

    return {
      id: q.id,
      question: q.question,
      options: q.options,
      chosenIndex,
      correctIndex: q.correctIndex,
      isCorrect,
      isSkipped,
      explanation: q.explanation || 'কোনো ব্যাখ্যা দেওয়া নেই।'
    };
  });

  res.json({
    success: true,
    examTitle: exam.title,
    student: {
      roll: submission.roll,
      name: submission.name
    },
    summary: {
      score: submission.score,
      totalMarks: submission.totalMarks,
      correctCount: submission.correctCount,
      wrongCount: submission.wrongCount,
      skippedCount: submission.skippedCount,
      timeTakenSeconds: submission.timeTakenSeconds,
      submittedAt: submission.submittedAt
    },
    questions: reviewQuestions
  });
});

// ==========================================
// ADMIN API ENDPOINTS
// ==========================================

const ADMIN_DEFAULT_PASS = process.env.ADMIN_PASSWORD || 'Nucrackers#.com';

// 9. Admin Login verification
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (!password) {
    return res.status(400).json({ success: false, message: 'এডমিন পাসওয়ার্ড প্রদান করুন।' });
  }

  if (String(password).trim() === ADMIN_DEFAULT_PASS) {
    return res.json({
      success: true,
      message: 'এডমিন লগইন সফল হয়েছে!',
      token: 'nu-admin-authorized-token'
    });
  }

  return res.status(401).json({
    success: false,
    message: 'ভুল এডমিন পাসওয়ার্ড! অনুগ্রহ করে সঠিক পাসওয়ার্ড দিয়ে চেষ্টা করুন।'
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

// 12. Admin: Add new student with STRICT UNIQUE ROLL validation
app.post('/api/admin/students', (req, res) => {
  const { roll, name, group } = req.body;

  if (!roll || !name || !group) {
    return res.status(400).json({
      success: false,
      message: 'শিক্ষার্থীর নাম, রোল নম্বর এবং গ্রুপ আবশ্যক।'
    });
  }

  const cleanRoll = String(roll).trim();
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

  // Strict Unique Roll check
  const duplicate = db.students.find(
    s => String(s.roll).trim().toLowerCase() === cleanRoll.toLowerCase()
  );

  if (duplicate) {
    return res.status(409).json({
      success: false,
      message: `রোল "${cleanRoll}" ইতিমধ্যে ব্যবহৃত হচ্ছে! এই রোলে শিক্ষার্থী "${duplicate.name}" (${duplicate.group.toUpperCase()}) রয়েছেন। রোল অবশ্যই ইউনিক হতে হবে।`
    });
  }

  const newStudent = {
    roll: cleanRoll,
    name: cleanName,
    group: cleanGroup,
    status: 'approved', // Admin added students are automatically approved
    registeredAt: new Date().toISOString()
  };

  db.students.push(newStudent);
  writeDb(db);

  return res.status(201).json({
    success: true,
    message: `শিক্ষার্থী "${cleanName}" (রোল: ${cleanRoll}) সফলভাবে যুক্ত করা হয়েছে!`,
    student: newStudent
  });
});

// 12.5. Admin: Approve student registration
app.put('/api/admin/students/:roll/approve', (req, res) => {
  const { roll } = req.params;
  const db = readDb();
  const student = (db.students || []).find(
    s => String(s.roll).trim().toLowerCase() === String(roll).trim().toLowerCase()
  );

  if (!student) {
    return res.status(404).json({ success: false, message: 'শিক্ষার্থী পাওয়া যায়নি।' });
  }

  student.status = 'approved';
  student.approvedAt = new Date().toISOString();
  writeDb(db);

  return res.json({
    success: true,
    message: `শিক্ষার্থী "${student.name}" (রোল: ${student.roll}) এর রেজিস্ট্রেশন সফলভাবে অনুমোদন (Approve) করা হয়েছে! এখন তিনি লগইন করতে পারবেন।`,
    student
  });
});

// 13. Admin: Update student details
app.put('/api/admin/students/:roll', (req, res) => {
  const { roll } = req.params;
  const { name, group } = req.body;

  const db = readDb();
  const student = (db.students || []).find(
    s => String(s.roll).trim().toLowerCase() === String(roll).trim().toLowerCase()
  );

  if (!student) {
    return res.status(404).json({ success: false, message: 'শিক্ষার্থী পাওয়া যায়নি।' });
  }

  if (name) student.name = String(name).trim();
  if (group && ['science', 'arts', 'commerce'].includes(group.toLowerCase())) {
    student.group = group.toLowerCase();
  }

  writeDb(db);
  return res.json({
    success: true,
    message: 'শিক্ষার্থীর তথ্য আপডেট করা হয়েছে।',
    student
  });
});

// 14. Admin: Delete student
app.delete('/api/admin/students/:roll', (req, res) => {
  const { roll } = req.params;
  const db = readDb();

  const cleanRoll = String(roll).trim().toLowerCase();
  const initialLength = (db.students || []).length;
  db.students = (db.students || []).filter(
    s => String(s.roll).trim().toLowerCase() !== cleanRoll
  );

  if (db.students.length === initialLength) {
    return res.status(404).json({ success: false, message: 'মুছে ফেলার জন্য শিক্ষার্থী পাওয়া যায়নি।' });
  }

  writeDb(db);
  return res.json({
    success: true,
    message: `রোল "${roll}" এর শিক্ষার্থী সফলভাবে মুছে ফেলা হয়েছে।`
  });
});

// 15. Admin: Get all exams (with full questions)
app.get('/api/admin/exams', (req, res) => {
  const db = readDb();
  res.json({
    success: true,
    exams: db.exams || []
  });
});

// 16. Admin: Create new exam
app.post('/api/admin/exams', (req, res) => {
  const { id, group, title, subject, durationMinutes, totalMarks, passMarks, negativeMark, description } = req.body;

  if (!title || !group || !subject) {
    return res.status(400).json({ success: false, message: 'পরীক্ষার নাম, গ্রুপ ও বিষয় আবশ্যক।' });
  }

  const cleanGroup = String(group).trim().toLowerCase();
  if (!['science', 'arts', 'commerce'].includes(cleanGroup)) {
    return res.status(400).json({ success: false, message: 'গ্রুপ Science, Arts বা Commerce হতে হবে।' });
  }

  const db = readDb();
  if (!Array.isArray(db.exams)) db.exams = [];

  const examId = id ? String(id).trim().toLowerCase().replace(/\s+/g, '-') : `${cleanGroup.slice(0, 3)}-${Date.now()}`;

  // Check unique exam ID
  if (db.exams.some(e => e.id === examId)) {
    return res.status(409).json({ success: false, message: 'এই আইডির পরীক্ষা ইতিমধ্যে বিদ্যমান।' });
  }

  const newExam = {
    id: examId,
    group: cleanGroup,
    title: String(title).trim(),
    subject: String(subject).trim(),
    durationMinutes: Number(durationMinutes) || 15,
    totalMarks: Number(totalMarks) || 10,
    passMarks: Number(passMarks) || 5,
    negativeMark: Number(negativeMark) || 0.25,
    status: 'live',
    description: description ? String(description).trim() : '',
    questions: []
  };

  db.exams.push(newExam);
  writeDb(db);

  res.status(201).json({
    success: true,
    message: 'নতুন পরীক্ষা সফলভাবে তৈরি হয়েছে!',
    exam: newExam
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
  const { question, options, correctIndex, explanation } = req.body;

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

  const idx = Number(correctIndex);
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

// ==========================================
// STATIC ASSET SERVING
// ==========================================
app.use(express.static(__dirname, {
  extensions: ['html', 'htm'],
  index: 'index.html'
}));

// Fallback to index.html for non-API unknown routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`NU Crackers server listening on http://${HOST}:${PORT}`);
});
