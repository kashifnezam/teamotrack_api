// ==========================================================
// TeamoTrack
// auth.js
// Firebase Authentication
// ==========================================================

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  getIdToken,
} from 'https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js';

import { auth } from './firebase-config.js';

// ==========================================================
// Wait for Firebase Auth initialization
// ==========================================================

function waitForAuthUser() {
  return new Promise((resolve) => {
    /*
     * Firebase will call this after it has
     * restored the authentication state.
     */
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();

      resolve(user);
    });
  });
}

// ==========================================================
// Login
// ==========================================================

// ==========================================================
// Login
// ==========================================================

async function loginUser(email, password) {
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);

    const user = credential.user;

    const token = await getIdToken(user);

    return {
      user,
      token,
    };
  } catch (error) {
    console.error('Firebase login error:', error);

    switch (error?.code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        throw new Error('Invalid email or password');

      case 'auth/invalid-email':
        throw new Error('Please enter a valid email address');

      case 'auth/user-disabled':
        throw new Error('Your account has been disabled. Please contact support.');

      case 'auth/too-many-requests':
        throw new Error('Too many failed login attempts. Please try again later.');

      case 'auth/network-request-failed':
        throw new Error('Network error. Please check your internet connection.');

      default:
        throw new Error('Unable to sign in. Please try again.');
    }
  }
}

// ==========================================================
// Get Current User
// ==========================================================

async function getCurrentUser() {
  /*
   * Don't immediately use:
   *
   * auth.currentUser
   *
   * because Firebase may still be restoring
   * the authentication state.
   */
  return await waitForAuthUser();
}

// ==========================================================
// Get Fresh Firebase ID Token
// ==========================================================

async function getFreshToken() {
  /*
   * Wait until Firebase has finished
   * restoring the authentication state.
   */
  const user = await waitForAuthUser();

  if (!user) {
    return null;
  }

  /*
   * Firebase automatically:
   *
   * - returns the existing token if valid
   * - refreshes the token when necessary
   */
  const token = await getIdToken(user);

  return token;
}

// ==========================================================
// Logout
// ==========================================================

async function logoutUser() {
  await signOut(auth);
}

// ==========================================================
// Watch Authentication State
// ==========================================================

function watchAuthState(callback) {
  return onAuthStateChanged(auth, callback);
}

// ==========================================================
// Exports
// ==========================================================
window.logoutUser = logoutUser;
export { loginUser, logoutUser, getCurrentUser, getFreshToken, watchAuthState };
