const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcrypt');
const app = express();
const port = 3000;

mongoose.connect('mongodb://localhost/football_picks', { useNewUrlParser: true, useUnifiedTopology: true });

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true
}));

// User model
const User = mongoose.model('User', {
  username: String,
  password: String,
  isAdmin: Boolean,
  picks: [{
    game: mongoose.Schema.Types.ObjectId,
    pick: String
  }]
});

// Game model
const Game = mongoose.model('Game', {
  homeTeam: String,
  awayTeam: String,
  week: Number,
  season: Number,
  winner: String
});

// Score model
const Score = mongoose.model('Score', {
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  week: Number,
  season: Number,
  score: Number
});

// SeasonTotal model
const SeasonTotal = mongoose.model('SeasonTotal', {
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  season: Number,
  totalScore: Number
});

// Middleware to check if user is admin
const isAdmin = (req, res, next) => {
  if (req.session.userId) {
    User.findById(req.session.userId).then(user => {
      if (user && user.isAdmin) {
        next();
      } else {
        res.redirect('/');
      }
    });
  } else {
    res.redirect('/login');
  }
};

// Middleware to check if user is authenticated
const isAuthenticated = (req, res, next) => {
  if (req.session.userId) {
    next();
  } else {
    res.redirect('/login');
  }
};

// Helper function to get current week and season
function getCurrentWeekAndSeason() {
  const currentDate = new Date();
  const startDate = new Date('2024-09-17'); // Tuesday, September 17, 2024 (Week 3 start)
  const millisecondsPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksPassed = Math.floor((currentDate - startDate) / millisecondsPerWeek);
  const week = weeksPassed + 3; // Start at Week 3
  const season = currentDate.getFullYear();

  return { week, season };
}

// Routes
app.get('/', (req, res) => {
  res.render('index');
});

app.get('/register', (req, res) => {
  res.render('register');
});

app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const user = new User({ username, password: hashedPassword, isAdmin: false });
  await user.save();
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });
  if (user && await bcrypt.compare(password, user.password)) {
    req.session.userId = user._id;
    res.redirect('/picks');
  } else {
    res.redirect('/login');
  }
});

app.get('/picks', isAuthenticated, async (req, res) => {
  const user = await User.findById(req.session.userId);
  const { week, season } = getCurrentWeekAndSeason();
  const games = await Game.find({ week, season });
  res.render('picks', { games, userPicks: user.picks, week, season });
});

app.post('/picks', isAuthenticated, async (req, res) => {
  const user = await User.findById(req.session.userId);
  const { week, season } = getCurrentWeekAndSeason();
  user.picks = Object.entries(req.body).map(([gameId, pick]) => ({
    game: gameId,
    pick
  }));
  await user.save();
  res.redirect('/picks');
});

app.get('/all-picks', isAuthenticated, async (req, res) => {
  const { week, season } = getCurrentWeekAndSeason();
  const games = await Game.find({ week, season });
  const users = await User.find({}).select('username picks');
  const scores = await Score.find({ week, season });
  res.render('all-picks', { games, users, scores, week, season });
});

app.get('/leaderboard', isAuthenticated, async (req, res) => {
  const { season } = getCurrentWeekAndSeason();
  
  // Fetch all scores for the current season
  const allScores = await Score.find({ season }).populate('user', 'username');
  
  // Calculate season totals
  const seasonTotals = allScores.reduce((totals, score) => {
    const userId = score.user._id.toString();
    if (!totals[userId]) {
      totals[userId] = {
        user: {
          _id: score.user._id,
          username: score.user.username
        },
        totalScore: 0,
        weeklyScores: {}
      };
    }
    totals[userId].totalScore += score.score;
    totals[userId].weeklyScores[score.week] = score.score;
    return totals;
  }, {});

  // Convert to array and sort
  const sortedTotals = Object.values(seasonTotals).sort((a, b) => b.totalScore - a.totalScore);

  res.render('leaderboard', { 
    seasonTotals: sortedTotals, 
    season, 
    getCurrentWeekAndSeason 
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Admin routes
app.get('/admin', isAdmin, async (req, res) => {
  const { week, season } = getCurrentWeekAndSeason();
  const games = await Game.find({ week, season });
  res.render('admin', { games, week, season });
});

app.post('/admin/add-game', isAdmin, async (req, res) => {
  const { homeTeam, awayTeam } = req.body;
  const { week, season } = getCurrentWeekAndSeason();
  const game = new Game({
    homeTeam,
    awayTeam,
    week,
    season
  });
  await game.save();
  res.redirect('/admin');
});

app.post('/admin/delete-game', isAdmin, async (req, res) => {
  const { gameId } = req.body;
  await Game.findByIdAndDelete(gameId);
  res.redirect('/admin');
});

app.post('/admin/update-winner', isAdmin, async (req, res) => {
  const { gameId, winner } = req.body;
  await Game.findByIdAndUpdate(gameId, { winner });
  await updateScores();
  res.redirect('/admin');
});

// Function to update scores
async function updateScores() {
  const users = await User.find({});
  const { week, season } = getCurrentWeekAndSeason();
  const games = await Game.find({ week, season });

  for (const user of users) {
    let weekScore = 0;
    for (const game of games) {
      const userPick = user.picks.find(p => p.game.toString() === game._id.toString());
      if (userPick && userPick.pick === game.winner) {
        weekScore++;
      }
    }

    await Score.findOneAndUpdate(
      { user: user._id, week, season },
      { score: weekScore },
      { upsert: true }
    );

    // Update season total
    const userScores = await Score.find({ user: user._id, season });
    const seasonTotal = userScores.reduce((total, score) => total + score.score, 0);

    await SeasonTotal.findOneAndUpdate(
      { user: user._id, season },
      { totalScore: seasonTotal },
      { upsert: true }
    );
  }
}

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
