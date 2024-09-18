# weekly-picks
fun node site to manage family weekly foot-ball picks

To set up and run this project:

1. Create a new directory for your project and navigate to it in the terminal.
2. Initialize a new Node.js project: `npm init -y`
3. Install the required dependencies:
   ```
   npm install express mongoose express-session bcrypt ejs
   ```
4. Create a `views` directory and add the EJS files (`index.ejs, register.ejs, login.ejs, leaderboard.ejs, all-picks.ejs, and picks.ejs`).
5. Move `server.js` to the root directory.
6. Make sure you have MongoDB installed and running on your system.
7. Start the server by running: `node server.js`

Now you can access the application by opening a web browser and navigating to `http://localhost:3000`.

This simple implementation provides:
- User registration and login
- The ability for users to choose winners for football games
- The ability to edit and save picks
- Basic session management for authentication
- Leaderboard with scores for each user
- Admin functionality to set scores and mark game winners
