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

// ... (previous model definitions and middleware remain the same)

// Helper functions
function getCurrentWeekAndSeason() {
  const currentDate = new Date();
  const startDate = new Date('2024-09-17'); // Tuesday, September 17, 2024 (Week 3 start)
  const millisecondsPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksPassed = Math.floor((currentDate - startDate) / millisecondsPerWeek);
  const week = weeksPassed + 3; // Start at Week 3
  const season = currentDate.getFullYear();

  return { week, season };
}

// Use this function in all relevant routes
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
  const seasonTotals = await SeasonTotal.find({ season }).sort('-totalScore').populate('user', 'username');
  res.render('leaderboard', { seasonTotals, season });
});

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

// ... (other routes remain the same)

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
