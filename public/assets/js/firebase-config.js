// ==========================================================
// TeamoTrack
// firebase-config.js
// Firebase Web SDK Configuration
// ==========================================================

import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";

import {
    getAuth
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";


// ==========================================================
// Firebase Configuration
// ==========================================================

const firebaseConfig = {

    apiKey:
        "AIzaSyBMivqUGdnNvGAfUWbKRNp1kU_BTasW4ZQ",

    authDomain:
        "family-locator-4f676.firebaseapp.com",

    databaseURL:
        "https://family-locator-4f676-default-rtdb.firebaseio.com",

    projectId:
        "family-locator-4f676",

    storageBucket:
        "family-locator-4f676.appspot.com",

    messagingSenderId:
        "940248395110",

    appId:
        "1:940248395110:web:9d8c4f6c58d6ca10caeca7",

    measurementId:
        "G-WSKEXY57Z7"

};


// ==========================================================
// Initialize Firebase
// ==========================================================

const app =
    initializeApp(
        firebaseConfig
    );


// ==========================================================
// Firebase Authentication
// ==========================================================

const auth =
    getAuth(app);


export {
    app,
    auth
};