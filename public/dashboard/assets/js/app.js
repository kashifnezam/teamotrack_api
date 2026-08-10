/* ==========================================================
   TeamoTrack
   app.js
   Main Application Bootstrap
   ========================================================== */

console.log("App.js loaded");

async function initializeApp() {

    console.log("Initializing application...");

    await loadComponent(
        "sidebar-container",
        "../dashboard/components/sidebar.html"
    );

    await loadComponent(
        "header-container",
        "../dashboard/components/header.html"
    );

    initializePageHeader();


    initializeSidebar();
    if (typeof initializeDashboard === "function") {initializeDashboard();}
    initializeTheme();
    initializeRipple();

    console.log("Application initialized successfully");

}


/* ==========================================================
   Start Application
   ========================================================== */

if (document.readyState === "loading") {

    document.addEventListener("DOMContentLoaded", initializeApp);

} else {

    // DOM is already ready
    initializeApp();

}


/* ==========================================================
   Load HTML Component
   ========================================================== */

async function loadComponent(elementId, file) {

    try {

        const response = await fetch(file);

        if (!response.ok) {
            throw new Error(`Unable to load ${file}`);
        }

        const html = await response.text();

        const element = document.getElementById(elementId);

        if (!element) {
            throw new Error(
                `Element #${elementId} was not found`
            );
        }

        element.innerHTML = html;

    } catch (error) {

        console.error(
            `Component loading failed: ${file}`,
            error
        );

    }

}


/* ==========================================================
   Ripple Effect
   ========================================================== */

function initializeRipple() {

    document.querySelectorAll(".ripple").forEach(button => {

        button.addEventListener("click", function (e) {

            const circle = document.createElement("span");

            const diameter = Math.max(
                this.clientWidth,
                this.clientHeight
            );

            circle.style.width = diameter + "px";
            circle.style.height = diameter + "px";

            circle.style.left =
                e.offsetX - diameter / 2 + "px";

            circle.style.top =
                e.offsetY - diameter / 2 + "px";

            circle.classList.add("ripple-circle");

            this.appendChild(circle);

            setTimeout(() => {
                circle.remove();
            }, 500);

        });

    });

}

function initializePageHeader() {

    const pages = {

        // Dashboard
        "/dashboard": {
            title: "Dashboard",
            description: "Welcome back! Here's what's happening today."
        },

        // Team
        "/executives": {
            title: "Executives",
            description: "Manage your field executives."
        },

        "/teams": {
            title: "Teams",
            description: "Manage your teams and members."
        },

        "/shifts": {
            title: "Shifts",
            description: "Manage executive shifts and schedules."
        },

        "/departments": {
            title: "Departments",
            description: "Manage your organization departments."
        },

        // HR
        "/leave": {
            title: "Leave",
            description: "Manage employee leave requests and balances."
        },

        "/payroll": {
            title: "Payroll",
            description: "Manage employee payroll and salary information."
        },

        "/holidays": {
            title: "Holidays",
            description: "Manage company holidays and working days."
        },

        "/recruitment": {
            title: "Recruitment",
            description: "Manage recruitment, candidates, and hiring."
        },

        // Manager
        "/projects": {
            title: "Projects",
            description: "Manage projects, assignments, and progress."
        },

        "/performance": {
            title: "Performance",
            description: "Monitor and manage employee performance."
        },

        "/reports": {
            title: "Reports",
            description: "View workforce management reports and analytics."
        },

        // Tasks
        "/tasks": {
            title: "Tasks",
            description: "Manage and track your team's tasks."
        },

        "/tasks/assigned": {
            title: "Assigned Tasks",
            description: "View tasks assigned to you or your team."
        },

        "/tasks/completed": {
            title: "Completed Tasks",
            description: "View completed and closed tasks."
        },

        // Attendance
        "/attendance": {
            title: "Attendance",
            description: "Manage and monitor employee attendance."
        },

        "/attendance/daily": {
            title: "Daily Attendance",
            description: "View and manage daily employee attendance."
        },

        "/attendance/monthly": {
            title: "Monthly Attendance",
            description: "View monthly attendance records and summaries."
        },

        "/attendance/live": {
            title: "Live Tracking",
            description: "Track field executives and employee activity in real time."
        },

        // Settings
        "/settings/company": {
            title: "Company Settings",
            description: "Manage your company information and configuration."
        },

        "/settings/users": {
            title: "Users",
            description: "Manage system users and their access."
        },

        "/settings/roles": {
            title: "Roles",
            description: "Manage user roles and permissions."
        },

        "/settings/preferences": {
            title: "Preferences",
            description: "Manage application preferences and settings."
        }
    };

    const path =
        window.location.pathname.replace(/\/$/, "") || "/dashboard";

    const page = pages[path];

    if (!page) return;

    document.getElementById("pageTitle").textContent =
        page.title;

    document.getElementById("pageDescription").textContent =
        page.description;
}