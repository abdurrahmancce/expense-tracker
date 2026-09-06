# 💰 Expense Tracker & Bonus Tracker

> **A modern, responsive web application for managing personal expenses, tracking bonus/income, analyzing spending patterns, and exporting financial records.**

![Expense Tracker](https://img.shields.io/badge/Expense-Tracker-007BFF?style=for-the-badge\&logo=moneygram\&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=for-the-badge\&logo=javascript\&logoColor=black)
![Firebase](https://img.shields.io/badge/Firebase-Firestore-FFCA28?style=for-the-badge\&logo=firebase\&logoColor=black)
![Chart.js](https://img.shields.io/badge/Charts-Chart.js-FF6384?style=for-the-badge\&logo=chartdotjs\&logoColor=white)
![Responsive](https://img.shields.io/badge/Design-Responsive-28A745?style=for-the-badge)

---

## 📌 Overview

**Expense Tracker & Bonus Tracker** is a web-based personal finance management application designed to make everyday expense and income tracking simple, organized, and accessible.

The application allows users to securely **create an account, log in, record expenses, manage bonus/income entries, view monthly and yearly summaries, analyze spending through charts, switch between light and dark modes, and export financial data to PDF or Excel.**

User data is stored in **Firebase Firestore**, while authentication is handled through **Firebase Authentication**.

---

## 🔗 Project Links

* 📂 **GitHub Repository:** [Expense Tracker](https://github.com/abdurrahmancce/Expense-Tracker)
* 🌐 **Live Preview:** [View Live Demo](https://abdurrahmancce.github.io/expense-tracker/)

---

## ✨ Key Features

### 🔐 User Authentication

* 👤 User registration
* 🔑 Email/password login
* 🚪 Logout functionality
* ⚠️ Authentication error handling
* 🔒 User-specific financial data

The authentication interface provides dedicated **Login** and **Sign Up** forms.

### 💸 Expense Management

* ➕ Add new expenses
* ✏️ Edit existing expenses
* 🗑️ Delete expenses
* 📅 Record expense dates
* 💰 Track expense amounts
* 🏷️ Store expense item names
* 📋 View all recorded expenses

Expense records contain an item, amount, and date, with editing and deletion controls available directly from the expense table.

### 📆 Monthly Expense Filtering

* 🔎 View all expenses
* 📅 Filter expenses by month
* 📊 Display monthly totals
* 🧮 Calculate all-time expense totals
* ⚡ Quickly switch between available months

### 📊 Financial Summaries

The application automatically organizes expenses into:

* 📅 Monthly summaries
* 📆 Yearly summaries
* 💰 Monthly spending totals
* 📈 Yearly spending totals

The JavaScript groups expense records by year and month before generating the summary tables.

### 📈 Expense Visualization

The application provides visual spending analysis using **Chart.js**:

* 📊 Monthly spending bar chart
* 🥧 Yearly spending pie chart
* 🔄 Automatic chart updates when data changes

The charts are generated from monthly and yearly expense totals.

### 🎁 Bonus / Income Tracker

Users can record additional income or bonus information including:

* 📅 Year
* 🗓️ Month
* 📆 Date
* 👤 Giver name
* 💵 Amount

The application includes a dedicated Bonus/Income Tracker section.

### 📄 PDF Export

Generate a complete financial report containing:

* 💰 Total expenses
* 🎁 Total bonus/income
* 🧮 Net balance
* 📋 Complete expense table
* 🎁 Complete bonus/income table
* 📅 Date-based sorting

The PDF report calculates total expenses, total income, and net income minus expenses before exporting the data.

### 📊 Excel Export

Export financial records into an Excel workbook containing:

* 📑 **Expenses**
* 🎁 **Bonus_Income**
* 📅 **Monthly Summary**

Expense and income records are sorted chronologically before being added to the workbook.

### 🌙 Dark Mode

* 🌙 Dark Mode
* ☀️ Light Mode
* 💾 User preference saved to Firestore
* 📱 Responsive dark-mode styling

The selected theme is stored along with the user's financial data.

### ☁️ Cloud Data Storage

The application uses **Firebase Firestore** to store:

```text
users
 └── user UID
      ├── expenses
      ├── salamis
      └── darkMode
```

Data is loaded after authentication and saved to the authenticated user's Firestore document.

### 🔄 Data Migration

If older expense or bonus data exists in browser `localStorage`, the application can detect it and provide an option to migrate that data into the user's Firebase account.

---

## 🛠️ Technology Stack

| Technology                     | Purpose                               |
| ------------------------------ | ------------------------------------- |
| 🌐 **HTML5**                   | Application structure                 |
| 🎨 **CSS3**                    | Styling and responsive UI             |
| ⚡ **JavaScript**               | Application logic and data processing |
| 🔥 **Firebase Authentication** | User authentication                   |
| ☁️ **Firebase Firestore**      | Cloud data storage                    |
| 📈 **Chart.js**                | Financial charts                      |
| 📄 **jsPDF**                   | PDF generation                        |
| 📋 **jsPDF AutoTable**         | PDF tables                            |
| 📊 **SheetJS / XLSX**          | Excel export                          |
| 💾 **LocalStorage**            | Legacy data migration                 |

The required third-party libraries are loaded directly in the HTML application.

---

## 📂 Project Structure

```text
Expense-Tracker/
│
├── 📄 index.html
├── 🎨 style.css
├── ⚡ script.js
│
├── 🔄 restore.html
├── 💾 Expense_Tracker_Recovery.html
└── 🧹 dedupe.html
```

### Core Application

```text
index.html
   │
   ├── Authentication UI
   ├── Expense Management
   ├── Expense Tables
   ├── Monthly/Yearly Summary
   ├── Charts
   ├── Bonus/Income Tracker
   └── Export Controls

style.css
   │
   ├── Responsive Layout
   ├── Forms
   ├── Tables
   ├── Buttons
   ├── Dropdowns
   └── Dark Mode

script.js
   │
   ├── Firebase Configuration
   ├── Authentication
   ├── Firestore Operations
   ├── Expense Management
   ├── Income Management
   ├── Charts
   ├── PDF Export
   ├── Excel Export
   └── Data Migration
```

---

## 🚀 Getting Started

### 1️⃣ Clone the Repository

```bash
git clone https://github.com/your-username/expense-tracker.git
```

### 2️⃣ Open the Project

Navigate into the project directory:

```bash
cd expense-tracker
```

### 3️⃣ Run the Application

Because this is a client-side web application, you can run it using a local development server.

For example, with VS Code:

```text
Right Click → Open with Live Server
```

Or use any static web server.

### 4️⃣ Configure Firebase

Create a Firebase project and enable:

* 🔐 Firebase Authentication
* ☁️ Cloud Firestore

Then update the Firebase configuration in `script.js`.

> ⚠️ **Security Note:** Do not commit sensitive credentials, service-account keys, or private Firebase configuration files to a public repository.

---

## 🔄 Application Workflow

```text
            👤 User
               │
               ▼
        🔐 Login / Sign Up
               │
               ▼
        ☁️ Firebase Auth
               │
               ▼
        📊 Expense Tracker
          ┌────┴────┐
          ▼         ▼
      💸 Expenses  🎁 Income
          │         │
          └────┬────┘
               ▼
       📊 Summaries & Charts
               │
          ┌────┴────┐
          ▼         ▼
       📄 PDF    📊 Excel
               │
               ▼
          💾 Reports
```

---

## 🎯 Main Use Cases

### 💰 Personal Expense Management

Track everyday expenses such as:

* 🍔 Food
* 🚌 Transportation
* 🎓 Education
* 🛍️ Shopping
* 📱 Mobile recharge
* 🏠 Living expenses
* 🎁 Gifts
* 💳 Other personal expenses

### 🎁 Bonus / Income Tracking

Maintain a separate record of money received from different sources.

### 📊 Spending Analysis

Use monthly and yearly summaries to understand spending patterns and monitor financial activity.

### 📁 Financial Reporting

Export records for:

* 📄 Documentation
* 📊 Spreadsheet analysis
* 💼 Personal financial records
* 🗂️ Data backup

---

## 📱 Responsive Design

The interface is designed to adapt to different screen sizes.

The CSS includes responsive rules that change form layouts and chart sizing on smaller screens.

Supported layouts include:

* 🖥️ Desktop
* 💻 Laptop
* 📱 Mobile
* 📟 Tablet

---

## 🧹 Data Recovery & Maintenance Tools

The project also contains supporting utilities for managing and recovering stored data.

### 🔄 Data Recovery

`restore.html` provides a recovery interface for restoring expense data from a JSON array into browser storage.

### 🗄️ Firebase Data Restoration

The Firebase restoration utility can merge recovered expense and bonus/income data into the current Firestore account rather than replacing the existing records.

### 🧹 Duplicate Removal

`dedupe.html` provides a utility for removing exact duplicate expense and bonus/income records from Firestore. Expenses are compared using:

```text
item + amount + date
```

while bonus/income records use:

```text
year + month + date + giver + amount
```

---

## 💡 Design Highlights

* 🎨 Clean and minimal interface
* 📱 Responsive layout
* 🌙 Dark mode support
* 📊 Visual financial analytics
* 🔐 Authentication-based access
* ☁️ Cloud-backed data storage
* 📄 Professional report generation
* 📊 Spreadsheet export
* 🔄 Legacy data migration
* 🧹 Data maintenance utilities

---

## 🔮 Future Improvements

Potential enhancements for future versions:

* 📌 Expense categories
* 🔍 Advanced search
* 🏷️ Category-based analytics
* 💰 Budget management
* 🔔 Spending alerts
* 📅 Calendar-based expense view
* 📈 More advanced financial dashboards
* 📱 Progressive Web App support
* 🔄 Automatic cloud backups
* 📤 CSV import/export
* 🎯 Monthly spending limits
* 📊 Category-wise charts
* 💡 Financial insights and recommendations

---

## 🤝 Contributing

Contributions are welcome!

If you'd like to improve the project:

```bash
# Fork the repository
# Create a new branch
git checkout -b feature/your-feature

# Make your changes
git add .

# Commit your changes
git commit -m "Add: your feature"

# Push your branch
git push origin feature/your-feature
```

Then open a **Pull Request**.

---

## 🐛 Issues & Feedback

Found a bug or have an idea?

Feel free to open an **Issue** and provide:

* 📝 A clear description
* 🔁 Steps to reproduce
* 🖥️ Browser/device information
* 📸 Screenshots when helpful
* 💡 Suggested improvement

---

## 📜 License

🔒 **Permission Required — All Rights Reserved**

Copyright © 2026 **Abdur Rahman Akash**

This project is **not open source** and may not be copied, modified, redistributed, deployed, or used commercially without prior written permission from the author.

You may view and study the source code for educational purposes. Any other use requires explicit permission.

📩 **Permission Requests:**

Please contact **Abdur Rahman Akash** through 📧 Email: ```akash.abdur.2002@gmail.com```

See the [`LICENSE`](LICENSE) file for the complete terms and conditions.

---

## 👨‍💻 Developer

**Abdur Rahman Akash**

* 🎓 Computer & Communication Engineering Student
* 💻 Python & Software Developer
* 🤖 AI & Machine Learning Enthusiast

### 🔗 Connect With Me

* 💼 LinkedIn: [Abdur Rahman Akash](https://www.linkedin.com/in/abdur-rahman-akash26/)
* 🐙 GitHub: [abdurrahmancce](https://github.com/abdurrahmancce)
* 🌐 Portfolio: [Personal Portfolio](https://abdurrahmancce.github.io/Personal-Portfolio/)
* 📧 Email: `akash.abdur.2002@gmail.com`

---

## ⭐ Support the Project

If you find this project useful:

⭐ **Star the repository**

🍴 **Fork the project**

🐛 **Report issues**

💡 **Suggest improvements**

🤝 **Contribute**

---

<div align="center">

💰 Manage Your Money. 📊 Understand Your Spending. 🚀 Improve Your Financial Habits.

Built with ❤️ by Abdur Rahman

</div>

