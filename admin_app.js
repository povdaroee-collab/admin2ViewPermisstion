// --- នាំចូល Firebase SDKs ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, collection, query, where, onSnapshot, Timestamp, setLogLevel } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Enable Firestore debug logging
setLogLevel('debug');

// --- ការកំណត់រចនាសម្ព័ន្ធ Firebase (ដូចគ្នានឹងកម្មវិធី User) ---
// (សូម​ប្រាកដ​ថា​ព័ត៌មាន​នេះ​ត្រឹមត្រូវ)
const firebaseConfig = { 
    apiKey: "AIzaSyDjr_Ha2RxOWEumjEeSdluIW3JmyM76mVk", 
    authDomain: "dipermisstion.firebaseapp.com", 
    projectId: "dipermisstion", 
    storageBucket: "dipermisstion.firebasestorage.app", 
    messagingSenderId: "512999406057", 
    appId: "1:512999406057:web:953a281ab9dde7a9a0f378", 
    measurementId: "G-KDPHXZ7H4B" 
};

// --- ផ្លូវ (Path) ទៅកាន់ Collections (ដូចគ្នានឹងកម្មវិធី User) ---
let leaveRequestsCollectionPath, outRequestsCollectionPath;

// --- Global Variables ---
let db, auth;
let tabLeave, tabOut, pageLeave, pageOut, leaveListContainer, outListContainer, leavePlaceholder, outPlaceholder, loadingIndicator;
let openFilterBtn, filterModal, filterMonth, filterYear, applyFilterBtn, cancelFilterBtn;

let currentFilterMonth, currentFilterYear;
let leaveUnsubscribe = null;
let outUnsubscribe = null;

// --- Date Helper Functions ---
function formatFirestoreTimestamp(timestamp, format = 'HH:mm dd/MM/yyyy') {
    let date;
    if (!timestamp) return "";
    if (timestamp instanceof Date) date = timestamp;
    else if (timestamp.toDate) date = timestamp.toDate();
    else if (typeof timestamp === 'string') {
        date = new Date(timestamp);
        if (isNaN(date.getTime())) return "";
    } else if (timestamp.seconds) date = new Date(timestamp.seconds * 1000);
    else return "";

    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    if (format === 'HH:mm' || format === 'time') return `${hours}:${minutes}`;
    if (format === 'dd/MM/yyyy' || format === 'date') return `${day}/${month}/${year}`;
    return `${hours}:${minutes} ${day}/${month}/${year}`;
}

// --- App Initialization ---
document.addEventListener('DOMContentLoaded', async () => {

    // --- កំណត់ Element References ---
    tabLeave = document.getElementById('tab-leave');
    tabOut = document.getElementById('tab-out');
    pageLeave = document.getElementById('page-leave');
    pageOut = document.getElementById('page-out');
    leaveListContainer = document.getElementById('leave-list-container');
    outListContainer = document.getElementById('out-list-container');
    leavePlaceholder = document.getElementById('leave-placeholder');
    outPlaceholder = document.getElementById('out-placeholder');
    loadingIndicator = document.getElementById('loading-indicator');
    openFilterBtn = document.getElementById('open-filter-btn');
    filterModal = document.getElementById('filter-modal');
    filterMonth = document.getElementById('filter-month');
    filterYear = document.getElementById('filter-year');
    applyFilterBtn = document.getElementById('apply-filter-btn');
    cancelFilterBtn = document.getElementById('cancel-filter-btn');

    // --- កំណត់ Filter ដំបូង (ខែ និង ឆ្នាំ បច្ចុប្បន្ន) ---
    const now = new Date();
    currentFilterMonth = now.getMonth(); // 0-11
    currentFilterYear = now.getFullYear();
    
    // Update <select> ឲ្យ​បង្ហាញ​តម្លៃ​បច្ចុប្បន្ន
    filterMonth.value = currentFilterMonth;
    filterYear.value = currentFilterYear;

    // --- កំណត់ Event Listeners ---
    tabLeave.addEventListener('click', () => showTab('leave'));
    tabOut.addEventListener('click', () => showTab('out'));
    openFilterBtn.addEventListener('click', openFilterModal);
    cancelFilterBtn.addEventListener('click', closeFilterModal);
    applyFilterBtn.addEventListener('click', applyFilter);

    // --- Firebase Initialization & Auth ---
    try {
        if (!firebaseConfig.projectId) throw new Error("projectId not provided in firebase.initializeApp.");
        
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);
        
        const canvasAppId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        leaveRequestsCollectionPath = `/artifacts/${canvasAppId}/public/data/leave_requests`;
        outRequestsCollectionPath = `/artifacts/${canvasAppId}/public/data/out_requests`;
        
        console.log("Admin App: Using Firestore Leave Path:", leaveRequestsCollectionPath);
        console.log("Admin App: Using Firestore Out Path:", outRequestsCollectionPath);

        onAuthStateChanged(auth, (user) => {
            if (user) {
                console.log("Admin App: Firebase Auth state changed. User UID:", user.uid);
                // ចាប់ផ្តើមទាញទិន្នន័យដំបូង
                fetchFilteredData();
            } else {
                console.log("Admin App: No user signed in. Attempting anonymous sign-in...");
                signInAnonymously(auth).catch(anonError => {
                    console.error("Admin App: Error during automatic anonymous sign-in:", anonError);
                });
            }
        });

        // ព្យាយាម Sign In ជា Anonymous នៅពេលបើកកម្មវិធី
        await signInAnonymously(auth);

    } catch (e) {
        console.error("Admin App: Firebase Initialization/Auth Error:", e);
        if(loadingIndicator) loadingIndicator.innerHTML = `<p class="text-red-600 font-semibold">Error: មិនអាចតភ្ជាប់ Firebase បានទេ។ ${e.message}</p>`;
    }
});

// --- មុខងារ​ប្ដូរ Tab ---
function showTab(tabName) {
    if (tabName === 'leave') {
        pageLeave.classList.remove('hidden');
        pageOut.classList.add('hidden');
        tabLeave.classList.add('active');
        tabOut.classList.remove('active');
    } else {
        pageLeave.classList.add('hidden');
        pageOut.classList.remove('hidden');
        tabLeave.classList.remove('active');
        tabOut.classList.add('active');
    }
}

// --- មុខងារ​ទាញ​ទិន្នន័យ​តាម Filter ---
function fetchFilteredData() {
    console.log(`Fetching data for: ${currentFilterMonth + 1}/${currentFilterYear}`);
    
    // បង្ហាញ Loading
    loadingIndicator.classList.remove('hidden');
    leavePlaceholder.classList.add('hidden');
    outPlaceholder.classList.add('hidden');
    leaveListContainer.innerHTML = '';
    outListContainer.innerHTML = '';

    // បញ្ឈប់ Listener ចាស់ (ប្រសិនបើមាន)
    if (leaveUnsubscribe) leaveUnsubscribe();
    if (outUnsubscribe) outUnsubscribe();

    // គណនា​ថ្ងៃ​ចាប់ផ្ដើម និង​ថ្ងៃ​បញ្ចប់​នៃ​ខែ​ដែល​បាន​ជ្រើសរើស
    try {
        const startDate = new Date(currentFilterYear, currentFilterMonth, 1);
        const endDate = new Date(currentFilterYear, currentFilterMonth + 1, 1);
        
        const startTimestamp = Timestamp.fromDate(startDate);
        const endTimestamp = Timestamp.fromDate(endDate);

        // --- បង្កើត Query សម្រាប់ ច្បាប់ឈប់សម្រាក ---
        // 1. ត្រូវតែ "approved"
        // 2. ត្រូវតែ​នៅ​ក្នុង​ចន្លោះ​ពេល​ដែល​បាន​ជ្រើសរើស (ផ្អែក​លើ requestedAt)
        const leaveQuery = query(
            collection(db, leaveRequestsCollectionPath),
            where("status", "==", "approved"),
            where("requestedAt", ">=", startTimestamp),
            where("requestedAt", "<", endTimestamp)
        );

        leaveUnsubscribe = onSnapshot(leaveQuery, (snapshot) => {
            console.log(`Received LEAVE snapshot. Size: ${snapshot.size}`);
            renderHistoryList(snapshot, leaveListContainer, leavePlaceholder, 'leave');
            loadingIndicator.classList.add('hidden'); // លាក់ Loading នៅពេលទិន្នន័យដំបូងមកដល់
        }, (error) => {
            console.error("Error listening to LEAVE history:", error);
            leavePlaceholder.innerHTML = `<p class="text-red-500">Error: មិនអាចទាញយកប្រវត្តិបានទេ ${error.message}</p>`;
            leavePlaceholder.classList.remove('hidden');
            loadingIndicator.classList.add('hidden');
        });

        // --- បង្កើត Query សម្រាប់ ច្បាប់ចេញក្រៅ ---
        const outQuery = query(
            collection(db, outRequestsCollectionPath),
            where("status", "==", "approved"),
            where("requestedAt", ">=", startTimestamp),
            where("requestedAt", "<", endTimestamp)
        );

        outUnsubscribe = onSnapshot(outQuery, (snapshot) => {
            console.log(`Received OUT snapshot. Size: ${snapshot.size}`);
            renderHistoryList(snapshot, outListContainer, outPlaceholder, 'out');
            loadingIndicator.classList.add('hidden');
        }, (error) => {
            console.error("Error listening to OUT history:", error);
            outPlaceholder.innerHTML = `<p class="text-red-500">Error: មិនអាចទាញយកប្រវត្តិបានទេ ${error.message}</p>`;
            outPlaceholder.classList.remove('hidden');
            loadingIndicator.classList.add('hidden');
        });

    } catch (e) {
        console.error("Error creating date query:", e);
        loadingIndicator.innerHTML = `<p class="text-red-600 font-semibold">Error: ${e.message}</p>`;
    }
}

// --- មុខងារ​បង្ហាញ Card ក្នុង​បញ្ជី ---
function renderHistoryList(snapshot, container, placeholder, type) {
    if (!container || !placeholder) return;
    
    if (snapshot.empty) {
        placeholder.classList.remove('hidden');
        container.innerHTML = '';
    } else {
        placeholder.classList.add('hidden');
        container.innerHTML = '';
        
        const requests = [];
        snapshot.forEach(doc => requests.push(doc.data()));

        // រៀបចំតាមថ្ងៃស្នើសុំ (ថ្មីមុន)
        requests.sort((a, b) => {
            const timeA = a.requestedAt?.toMillis() ?? 0;
            const timeB = b.requestedAt?.toMillis() ?? 0;
            return timeB - timeA; 
        });

        requests.forEach(request => {
            container.innerHTML += renderAdminCard(request, type);
        });
    }
}

// --- មុខងារ​បង្កើត HTML សម្រាប់ Card នីមួយៗ ---
function renderAdminCard(request, type) {
    if (!request || !request.requestId) return '';

    const dateString = (request.startDate === request.endDate) 
        ? request.startDate 
        : (request.startDate && request.endDate ? `${request.startDate} ដល់ ${request.endDate}` : 'N/A');
    
    const decisionTimeText = formatFirestoreTimestamp(request.decisionAt, 'HH:mm dd/MM/yyyy');

    // ពិនិត្យ​មើល​ការ "បញ្ជាក់​ចូល​មក​វិញ" (សម្រាប់​តែ​ច្បាប់​ចេញ​ក្រៅ)
    let returnInfo = '';
    if (type === 'out' && request.returnStatus === 'បានចូលមកវិញ') {
        returnInfo = `
            <div class="mt-3 pt-3 border-t border-dashed border-gray-200">
                <p class="text-sm font-semibold text-green-700">✔️ បានចូលមកវិញ</p>
                <p class="text-sm text-gray-600">នៅម៉ោង: ${request.returnedAt || 'N/A'}</p>
            </div>
        `;
    }

    return `
        <div class="bg-white border border-gray-200 rounded-lg shadow-sm p-4 mb-4">
            <div class="flex justify-between items-start">
                <div>
                    <p class="font-semibold text-gray-800">${request.name || 'N/A'} (${request.userId || 'N/A'})</p>
                    <p class="text-sm text-gray-500">${request.department || 'N/A'}</p>
                </div>
                <span class="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800">បានយល់ព្រម</span>
            </div>
            
            <hr class="my-3 border-gray-100">
            
            <div class="space-y-1 text-sm">
                <p><b>រយៈពេល:</b> ${request.duration || 'N/A'}</p>
                <p><b>កាលបរិច្ឆេទ:</b> ${dateString}</p>
                <p><b>មូលហេតុ:</b> ${request.reason || 'មិនបានបញ្ជាក់'}</p>
            </div>

            <div class="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
                <p>អនុម័ត: ${decisionTimeText}</p>
                <p class="mt-1">ID: ${request.requestId}</p>
            </div>

            ${returnInfo}
        </div>
    `;
}

// --- មុខងារ​សម្រាប់ Filter Modal ---
function openFilterModal() {
    // កំណត់​តម្លៃ​ក្នុង Modal ឲ្យ​ត្រូវ​នឹង Filter បច្ចុប្បន្ន
    filterMonth.value = currentFilterMonth;
    filterYear.value = currentFilterYear;
    filterModal.classList.remove('hidden');
}

function closeFilterModal() {
    filterModal.classList.add('hidden');
}

function applyFilter() {
    // យក​តម្លៃ​ថ្មី​ពី Modal
    currentFilterMonth = parseInt(filterMonth.value);
    currentFilterYear = parseInt(filterYear.value);
    
    // បិទ Modal
    closeFilterModal();
    
    // ហៅ​ទិន្នន័យ​ថ្មី​ដោយ​ផ្អែក​លើ Filter
    fetchFilteredData();
}
