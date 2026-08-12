// ==========================================================
// TeamoTrack
// auth.js
// Firebase Authentication
// ==========================================================

import {
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    getIdToken
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";

import {
    auth
} from "./firebase-config.js";


// ==========================================================
// Wait for Firebase Auth initialization
// ==========================================================

function waitForAuthUser() {

    return new Promise(
        (resolve) => {

            /*
             * Firebase will call this after it has
             * restored the authentication state.
             */
            const unsubscribe =
                onAuthStateChanged(
                    auth,
                    (user) => {

                        unsubscribe();

                        resolve(user);

                    }
                );

        }
    );

}


// ==========================================================
// Login
// ==========================================================

async function loginUser(
    email,
    password
) {

    const credential =
        await signInWithEmailAndPassword(
            auth,
            email,
            password
        );


    const user =
        credential.user;


    const token =
        await getIdToken(
            user
        );


    return {
        user,
        token
    };

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
    const user =
        await waitForAuthUser();


    console.log(
        "Firebase current user:",
        user
    );


    if (!user) {

        return null;

    }


    /*
     * Firebase automatically:
     *
     * - returns the existing token if valid
     * - refreshes the token when necessary
     */
    const token =
        await getIdToken(
            user
        );


    return token;

}


// ==========================================================
// Logout
// ==========================================================

async function logoutUser() {

    await signOut(
        auth
    );

}


// ==========================================================
// Watch Authentication State
// ==========================================================

function watchAuthState(
    callback
) {

    return onAuthStateChanged(
        auth,
        callback
    );

}


// ==========================================================
// Exports
// ==========================================================

export {
    loginUser,
    logoutUser,
    getCurrentUser,
    getFreshToken,
    watchAuthState
};