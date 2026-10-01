# 💰 Expense Tracker

> A responsive personal finance web application for tracking expenses, managing income, analyzing financial activity, and exporting organized reports.

<p align="center">
  <img src="https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript">
  <img src="https://img.shields.io/badge/Firebase-Backend-FFCA28?style=for-the-badge&logo=firebase&logoColor=black" alt="Firebase">
  <img src="https://img.shields.io/badge/Chart.js-Data%20Visualization-FF6384?style=for-the-badge&logo=chart.js&logoColor=white" alt="Chart.js">
  <img src="https://img.shields.io/badge/PWA-Enabled-5A0FC8?style=for-the-badge" alt="PWA">
  <img src="https://img.shields.io/badge/Responsive-Design-2563EB?style=for-the-badge" alt="Responsive">
</p>

<p align="center">
  <a href="https://abdurrahmancce.github.io/expense-tracker/">🌐 Live Demo</a>
  •
  <a href="https://github.com/abdurrahmancce/expense-tracker">📂 Repository</a>
</p>

---

## 📖 Overview

**Expense Tracker** is a web-based personal finance management application designed to help users keep track of their everyday expenses and additional income in one place.

The application provides tools for recording transactions, organizing expenses into categories, searching and sorting records, analyzing financial activity through interactive charts, generating PDF and Excel reports, and recovering deleted records.

It also includes **Firebase Authentication and Cloud Firestore** for account-based data storage, along with **Progressive Web App (PWA)** support for an app-like experience.

The application is designed to be simple enough for everyday personal use while providing useful features for organized financial tracking.

---

## 🌐 Live Application

🚀 **Use the application:**  
https://abdurrahmancce.github.io/expense-tracker/

📂 **GitHub Repository:**  
https://github.com/abdurrahmancce/expense-tracker

---

# ✨ Features

## 🔐 Authentication

Users can create an account and access their personal financial records.

- 👤 Create an account
- 🔑 Email/password login
- 🚪 Logout
- 🔄 Password reset
- ⚠️ Authentication error messages
- 👥 User-specific financial data

The application provides separate **Login** and **Sign Up** interfaces.

---

## 💸 Expense Management

Record and manage everyday expenses with detailed information.

Each expense can include:

- 📝 Item name
- 💰 Amount
- 🏷️ Category
- 📅 Date
- 🗒️ Optional note

Users can:

- ➕ Add expenses
- ✏️ Edit expenses
- 🗑️ Delete expenses
- 🔎 Search expenses
- 🏷️ Filter by category
- ↕️ Sort by date or amount
- 📅 Filter by month

The updated interface includes category and note fields directly in the expense form.

---

## 🏷️ Custom Expense Categories

Users can create and manage their own expense categories.

### Features

- 🏷️ Add categories
- ✏️ Edit categories
- 🗑️ Remove categories
- 🔎 Filter expenses by category
- 📊 Analyze spending by category

Default categories are available while users can also create categories according to their needs.

---

## 📌 Pinned Items

Frequently used expense names can be pinned for faster entry.

For example:

```text
📌 Transport Cost
📌 Lunch
📌 Internet Bill
📌 Tuition Fee
📌 Mobile Recharge
```

Clicking a pinned item can help speed up repetitive expense entry.

---

## 🔎 Search, Filter & Sort

The expense list includes tools for finding records quickly.

### 🔍 Search

Search expenses by item name.

### 🏷️ Category Filter

Display expenses belonging to a specific category.

### ↕️ Sorting

Available sorting options include:

- 📅 Oldest → Newest
- 📅 Newest → Oldest
- 💰 Lowest → Highest
- 💰 Highest → Lowest

These controls are available inside the **All Expenses** section.

---

# 📅 Monthly & Yearly Analysis

The application automatically organizes financial records into different time periods.

### 📆 Monthly Summary

View total spending for individual months.

### 🗓️ Yearly Summary

Review spending across an entire year.

This makes it easier to understand how expenses change over time.

---

# 📊 Financial Analytics

Interactive charts provide a visual overview of financial activity.

### 💸 Expense Charts

- 📊 Monthly expenses
- 📈 Yearly expenses
- 🏷️ Category-based expenses

### 💰 Income Charts

- 📊 Monthly income
- 📈 Yearly income

The current application includes dedicated chart sections for both expenses and bonus/income.

---

# 💰 Bonus / Income Tracker

The application also tracks money received from different sources.

Each income record can contain:

- 🗓️ Year
- 📅 Month
- 📆 Date
- 👤 Giver name
- 💵 Amount

Users can:

- ➕ Add income
- ✏️ Edit income
- 🗑️ Delete income
- 📅 Filter income by month
- 📊 View income summaries
- 📈 Analyze income through charts

The dedicated Bonus/Income section is built into the main application.

---

# 🗑️ Trash & Recovery

Deleted financial records are not immediately removed from the application.

Instead, deleted records are placed in a **Trash** section.

### 🛡️ Recovery Features

- 🗑️ Move deleted expenses to Trash
- 🗑️ Move deleted income records to Trash
- 🔄 Restore deleted records
- ⏳ Keep deleted records for 7 days
- 🧹 Permanently remove expired records

The application explicitly informs users that deleted entries remain in Trash for seven days before permanent deletion.

---

# 📄 PDF Export

Generate a financial report in PDF format.

The export functionality is useful for:

- 📋 Personal records
- 📊 Financial summaries
- 🖨️ Printing
- 📤 Sharing reports

The application uses **jsPDF** and **jsPDF AutoTable** for PDF generation.

---

# 📊 Excel Export

Export financial records to Excel for further analysis.

Excel export can be useful for:

- 📈 Data analysis
- 🧮 Calculations
- 📊 Custom reports
- 💾 Offline backups

The application uses **SheetJS / XLSX** for spreadsheet generation.

---

# 🌙 Dark Mode

The application supports both light and dark themes.

- ☀️ Light Mode
- 🌙 Dark Mode
- 💾 Theme preference persistence
- 📱 Responsive dark-mode interface

---

# 📱 Progressive Web App

The updated project includes **PWA support**.

The application contains a web app manifest with:

- 📱 Standalone display mode
- 📲 Installable app experience
- 🎨 Custom theme color
- 🖼️ 192×192 application icon
- 🖼️ 512×512 maskable icon
- 📐 Portrait orientation

The manifest defines the application as **Expense Tracker** with the short name **Expenses** and a standalone display mode.

A service worker is also included to cache core application resources and provide better resilience when network connectivity is unavailable.

---

# ☁️ Firebase Integration

The application uses Firebase for authentication and cloud data storage.

### 🔐 Firebase Authentication

Used for:

- Account creation
- Login
- Logout
- Password recovery

### ☁️ Cloud Firestore

Used for storing user-specific financial information.

Conceptually, the application organizes data around the authenticated user:

```text
users/
└── USER_UID/
    ├── expenses
    ├── salamis
    ├── categories
    ├── pinnedItems
    ├── trash
    └── darkMode
```

> 🔒 **Security:** Firebase client configuration is not itself an authorization mechanism. Firestore Security Rules should enforce which authenticated users can read and modify their own records.

---

# 🔄 Legacy Data Migration

The project supports migration of older data stored in browser `localStorage`.

If previous data is detected on the device, the application can provide an option to import the old records into the Firebase-backed account.

This helps users move from an older local-storage version to the newer cloud-based application.

---

# 🎨 User Interface

The application focuses on a clean and practical interface.

### UI elements include:

- 💳 Modern authentication card
- 🔘 Interactive buttons
- 📂 Expandable dropdown sections
- 📊 Financial charts
- 📋 Responsive tables
- 🔍 Search controls
- 🏷️ Category chips
- 📌 Pinned-item chips
- 🔔 Toast notifications
- ⏳ Loading overlay
- 🌙 Dark mode
- 📱 Mobile-friendly layout

---

# 📱 Responsive Design

The application is designed for multiple screen sizes.

| Device | Support |
|---|---|
| 🖥️ Desktop | ✅ |
| 💻 Laptop | ✅ |
| 📱 Mobile | ✅ |
| 📲 Tablet | ✅ |

On smaller screens, forms, filters, charts, and other interface elements adapt to the available screen width.

---

# 🛠️ Technology Stack

| Technology | Purpose |
|---|---|
| 🌐 **HTML5** | Application structure |
| 🎨 **CSS3** | UI design and responsive layout |
| ⚡ **JavaScript ES6+** | Application logic |
| 🔥 **Firebase Authentication** | User authentication |
| ☁️ **Cloud Firestore** | Cloud data storage |
| 📊 **Chart.js** | Financial data visualization |
| 📄 **jsPDF** | PDF generation |
| 📋 **jsPDF AutoTable** | PDF table generation |
| 📊 **SheetJS / XLSX** | Excel export |
| 💾 **LocalStorage** | Legacy data migration |
| 📱 **Web App Manifest** | PWA configuration |
| ⚙️ **Service Worker** | Asset caching and PWA support |
| 🌐 **GitHub Pages** | Web hosting |

---

# 📂 Project Structure

```text
expense-tracker/
│
├── 📄 index.html
├── 🎨 style.css
├── ⚡ script.js
├── 📱 manifest.json
├── ⚙️ sw.js
│
├── 🔄 restore.html
├── 🧹 dedupe.html
├── 💾 Expense_Tracker_Recovery.html
│
├── 📜 LICENSE
├── 📖 README.md
│
└── 🖼️ docs/
    └── screenshots/
```

### 📄 `index.html`

Main application interface containing:

- 🔐 Authentication
- 💸 Expense form
- 🏷️ Category management
- 📌 Pinned items
- 📋 Expense tables
- 📊 Financial summaries
- 📈 Charts
- 💰 Income tracker
- 🗑️ Trash
- 📤 Export controls

The current interface includes all of these major sections in the main application screen.

### ⚡ `script.js`

Contains the application's core JavaScript logic, including:

- 🔐 Firebase Authentication
- ☁️ Firestore operations
- 💸 Expense management
- 💰 Income management
- 🏷️ Categories
- 📌 Pinned items
- 🔎 Search and filtering
- 📊 Charts
- 📄 PDF generation
- 📊 Excel generation
- 🌙 Theme management
- 🗑️ Trash and recovery
- 🔄 Data migration

### 🎨 `style.css`

Controls:

- 🎨 Visual design
- 📱 Responsive layouts
- 🌙 Dark mode
- 🔐 Authentication UI
- 📋 Tables
- 📊 Charts
- 🔘 Buttons
- 🏷️ Category chips
- 📌 Pinned items
- 🔔 Toast notifications

### 📱 `manifest.json`

Defines the PWA metadata and installation behavior.

### ⚙️ `sw.js`

Provides service-worker functionality for:

- 💾 Caching application assets
- ⚡ Faster repeat loading
- 📴 Better resilience during temporary network problems
- 📱 PWA support

### 🔄 `restore.html`

Provides a recovery interface for restoring stored financial data.

### 🧹 `dedupe.html`

Provides a utility for identifying and removing duplicate financial records.

### 💾 `Expense_Tracker_Recovery.html`

Provides additional recovery and maintenance functionality.

---

# 🚀 Getting Started

## 1️⃣ Clone the Repository

```bash
git clone https://github.com/abdurrahmancce/expense-tracker.git
```

Move into the project:

```bash
cd expense-tracker
```

---

## 2️⃣ Run Locally

Because the project is a client-side web application, you can run it using a local development server.

### 💻 VS Code

Install the **Live Server** extension and open:

```text
index.html
```

Then:

```text
Right Click → Open with Live Server
```

A static HTTP server is recommended instead of opening the file directly with `file://`.

---

# 🔥 Firebase Configuration

To use authentication and cloud storage:

### Step 1: Create a Firebase Project

Create a project from the Firebase Console.

### Step 2: Enable Authentication

Enable the authentication provider required by the application.

### Step 3: Create Firestore

Create a Cloud Firestore database.

### Step 4: Configure the Application

Add the Firebase web configuration to the project.

### Step 5: Configure Security Rules

Configure Firestore Security Rules so that users can only access records belonging to their authenticated account.

> ⚠️ Never use client-side JavaScript as the only layer of authorization.

---

# ▶️ How to Use

## 🔐 1. Create an Account

Open the application and select:

```text
Sign Up
```

Enter your email and password.

---

## 🔑 2. Login

Use your registered credentials to access the application.

---

## 💸 3. Add an Expense

Enter:

```text
Item Name
Amount
Category
Date
Optional Note
```

Then select:

```text
Save Expense
```

---

## 📌 4. Use Pinned Items

Pin frequently used expense names to speed up repeated entries.

---

## 🏷️ 5. Manage Categories

Create categories that match your personal spending habits.

For example:

```text
🍔 Food
🚌 Transport
🎓 Education
🏥 Medical
🏠 Family Cost
💻 Technology
```

---

## 🔎 6. Search & Filter

Open **All Expenses** and use:

- 🔍 Search
- 🏷️ Category filter
- 📅 Month filter
- ↕️ Sort options

---

## 📊 7. Analyze Your Finances

Review:

- 📅 Monthly summaries
- 🗓️ Yearly summaries
- 📈 Expense charts
- 💰 Income charts
- 🏷️ Category analysis

---

## 💰 8. Track Income

Use the **Bonus/Income Tracker** to record money received from different sources.

---

## 🗑️ 9. Recover Deleted Records

Open:

```text
🗑️ Trash
```

Restore records within the available recovery period.

---

## 📤 10. Export Reports

Generate:

```text
📄 PDF
📊 Excel
```

for record keeping or further analysis.

---

# 🔄 Application Workflow

```text
                    👤 User
                       │
                       ▼
               🔐 Authentication
                       │
                       ▼
                📊 Main Dashboard
                       │
          ┌────────────┼────────────┐
          │            │            │
          ▼            ▼            ▼
       💸 Expenses   💰 Income   🏷️ Categories
          │            │            │
          └────────────┼────────────┘
                       │
                       ▼
              📊 Search & Analysis
                       │
              ┌────────┼────────┐
              │        │        │
              ▼        ▼        ▼
           📅 Monthly 📈 Charts 🗑️ Trash
           /Yearly
              │
              ▼
          📤 Export Reports
           ┌──────┴──────┐
           ▼             ▼
        📄 PDF        📊 Excel
```

---

# 🎯 Use Cases

### 👤 Personal Finance

Track everyday spending and income.

### 🎓 Students

Manage:

- 🍔 Food expenses
- 🚌 Transportation
- 🎓 Tuition
- 📚 Study materials
- 📱 Mobile expenses

### 🏠 Household Tracking

Keep track of recurring personal or family expenses.

### 📊 Financial Analysis

Review monthly and yearly spending patterns.

### 📁 Record Keeping

Export financial information into PDF or Excel for documentation.

---

# 🔮 Future Improvements

Planned or potential improvements include:

- 🎯 Budget limits
- 🔔 Budget notifications
- 📊 Advanced dashboard KPIs
- 📅 Calendar-based transactions
- 🔁 Recurring expenses
- 📤 CSV import/export
- 📈 Advanced category analytics
- 💳 Multiple account/payment tracking
- 🔍 More advanced search
- 📴 Improved offline functionality
- ☁️ Automated backup and restore
- 📊 Custom date-range reports
- 📱 Further PWA improvements
- 🧪 Automated testing
- 🧩 Modular JavaScript architecture

---

# 🤝 Contributing

Contributions and suggestions are welcome, subject to the project's license terms.

### Development Workflow

```bash
# Fork the repository

# Clone your fork
git clone https://github.com/your-username/expense-tracker.git

# Create a feature branch
git checkout -b feature/your-feature

# Make your changes

# Stage changes
git add .

# Commit
git commit -m "feat: add your feature"

# Push
git push origin feature/your-feature
```

Then create a Pull Request.

### 📝 Commit Convention

Recommended prefixes:

```text
feat:      New feature
fix:       Bug fix
docs:      Documentation
style:     Styling/UI
refactor:  Code restructuring
perf:      Performance improvement
security:  Security improvement
chore:     Maintenance
```

---

# 🐛 Issues & Feedback

If you find a problem or have an improvement idea, open a GitHub Issue.

Please include:

- 📝 Problem description
- 🔁 Steps to reproduce
- 🌐 Browser information
- 💻 Device/OS information
- 📸 Screenshot if applicable
- 💡 Suggested solution if available

---

# 📸 Screenshots

Add application screenshots under:

```text
docs/screenshots/
```

Recommended screenshots:

```text
docs/screenshots/
├── 🔐 authentication.png
├── 📊 dashboard.png
├── 💸 expenses.png
├── 🏷️ categories.png
├── 📈 analytics.png
├── 💰 income.png
├── 🗑️ trash.png
├── 🌙 dark-mode.png
└── 📱 mobile.png
```

Example:

```markdown
## 📸 Preview

![Dashboard](docs/screenshots/dashboard.png)
```

> 🖼️ Use real screenshots from the current version of the application rather than placeholder images.

---

# ⚖️ License

## 🔒 Permission Required License

Copyright © 2026 **Abdur Rahman Akash**

This project and its source code are **not licensed for free reuse, redistribution, modification, deployment, or commercial use**.

Viewing and studying the source code for educational purposes is permitted.

Any other use requires prior written permission from the author.

For complete terms, see:

📄 [`LICENSE`](LICENSE)

### 📩 Permission Requests

**Abdur Rahman Akash**

📧 `akash.abdur.2002@gmail.com`

🐙 https://github.com/abdurrahmancce

---

# 👨‍💻 Author

## Abdur Rahman Akash

🎓 Computer & Communication Engineering Student  
💻 Developer  
🤖 AI & Technology Enthusiast  
📚 Research & Software Development Learner

### 🔗 Connect

- 🐙 **GitHub:** https://github.com/abdurrahmancce
- 💼 **LinkedIn:** https://www.linkedin.com/in/abdur-rahman-akash26/
- 🌐 **Portfolio:** https://abdurrahmancce.github.io/Personal-Portfolio/
- 📧 **Email:** `akash.abdur.2002@gmail.com`

---

# ⭐ Support

If you find this project useful:

⭐ Star the repository  
🍴 Fork the project  
🐛 Report bugs  
💡 Suggest improvements  
🤝 Contribute where permitted

---

<div align="center">

## 💰 Track Better. 📊 Understand Better. 🚀 Manage Better.

**Built with ❤️ by Abdur Rahman Akash**

</div>
