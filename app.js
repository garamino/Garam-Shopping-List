// Firebase compat imports (remplace les CDN script tags)
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import 'firebase/compat/auth';

// Capacitor plugins
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { StatusBar, Style } from '@capacitor/status-bar';

// Import CSS (Vite injecte le style)
import './style.css';

// Capacitor : configurer la barre de statut sur Android
if (Capacitor.isNativePlatform()) {
    document.body.classList.add('native-app');
    StatusBar.setStyle({ style: Style.Light });
    StatusBar.setBackgroundColor({ color: '#667eea' });
    // Récupérer la vraie hauteur de la barre de statut
    StatusBar.getInfo().then(info => {
        const height = info.height || 0;
        document.documentElement.style.setProperty('--status-bar-height', height + 'px');
    }).catch(() => {
        // Fallback si getInfo n'est pas supporté
        document.documentElement.style.setProperty('--status-bar-height', '24px');
    });
}

// Capacitor : sauvegarde quand l'app passe en arrière-plan (Android)
CapApp.addListener('appStateChange', ({ isActive }) => {
    if (!isActive) {
        if (typeof saveToFirebase === 'function') saveToFirebase();
        if (typeof updatePresence === 'function') updatePresence(false);
    }
});

        // ========================================
        // SECURITY — Anti-XSS helper
        // ========================================
        function escapeHtml(str) {
            const div = document.createElement('div');
            div.textContent = String(str || '');
            return div.innerHTML;
        }

        function normalizeSearch(str) {
            return String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 ]/g, '').toLowerCase();
        }

        // ========================================
        // FIREBASE CONFIGURATION
        // ========================================
        const firebaseConfig = {
            apiKey: "AIzaSyBJjoBkEk-FdZ3gjfmKhGyCFc1tA7JXz5g",
            authDomain: "liste-course-8c2cf.firebaseapp.com",
            projectId: "liste-course-8c2cf",
            storageBucket: "liste-course-8c2cf.firebasestorage.app",
            messagingSenderId: "426451396001",
            appId: "1:426451396001:web:4789552edad9f52f5c97e0"
        };

        // Initialize Firebase
        let db = null;
        let auth = null;
        let currentUser = null;
        let userId = null;
        let isFirebaseReady = false;
        let dataLoaded = false; // Verrou anti-écrasement : bloque toute sauvegarde tant que les données n'ont pas été chargées

        // Partage de liste
        let activeListId = null;      // ID de la liste partagée active (null = liste perso)
        let listUnsubscribe = null;   // Désabonnement onSnapshot
        let presenceInterval = null;  // Heartbeat présence (60s)
        let userListMemberships = []; // Toutes les listes dont l'utilisateur est membre

        // ========================================
        // AUTHENTICATION — Firebase Auth
        // ========================================

        function showAuthError(elementId, msg) {
            const el = document.getElementById(elementId);
            if (!el) return;
            el.textContent = msg;
            el.style.display = 'block';
        }

        function hideAuthErrors() {
            ['loginError', 'registerError'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
        }

        function showCreateAccount() {
            hideAuthErrors();
            document.getElementById('authModal').classList.remove('show');
            document.getElementById('createAccountModal').classList.add('show');
        }

        function backToLogin() {
            hideAuthErrors();
            document.getElementById('createAccountModal').classList.remove('show');
            document.getElementById('authModal').classList.add('show');
        }

        function togglePasswordVisibility(btn) {
            const input = btn.previousElementSibling;
            if (input.type === 'password') {
                input.type = 'text';
                btn.textContent = '🙈';
            } else {
                input.type = 'password';
                btn.textContent = '👁️';
            }
        }

        async function loginWithEmail() {
            hideAuthErrors();
            const email = document.getElementById('loginEmailInput').value.trim();
            const password = document.getElementById('loginPasswordInput').value;
            if (!email || !password) {
                showAuthError('loginError', 'Veuillez remplir tous les champs');
                return;
            }
            try {
                await auth.signInWithEmailAndPassword(email, password);
            } catch (e) {
                const msgs = {
                    'auth/user-not-found': 'Aucun compte avec cet email.',
                    'auth/wrong-password': 'Mot de passe incorrect.',
                    'auth/invalid-email': 'Email invalide.',
                    'auth/invalid-credential': 'Email ou mot de passe incorrect.',
                    'auth/too-many-requests': 'Trop de tentatives. Réessayez plus tard.'
                };
                showAuthError('loginError', msgs[e.code] || 'Erreur de connexion.');
            }
        }

        async function registerWithEmail() {
            hideAuthErrors();
            const email = document.getElementById('newEmailInput').value.trim();
            const password = document.getElementById('newPasswordInput').value;
            const confirm = document.getElementById('confirmPasswordInput').value;
            if (!email || !password || !confirm) {
                showAuthError('registerError', 'Veuillez remplir tous les champs');
                return;
            }
            if (password.length < 6) {
                showAuthError('registerError', 'Le mot de passe doit contenir au moins 6 caractères.');
                return;
            }
            if (password !== confirm) {
                showAuthError('registerError', 'Les mots de passe ne correspondent pas.');
                return;
            }
            try {
                await auth.createUserWithEmailAndPassword(email, password);
            } catch (e) {
                const msgs = {
                    'auth/email-already-in-use': 'Un compte existe déjà avec cet email.',
                    'auth/invalid-email': 'Email invalide.',
                    'auth/weak-password': 'Mot de passe trop faible.'
                };
                showAuthError('registerError', msgs[e.code] || 'Erreur lors de la création du compte.');
            }
        }

        async function loginWithGoogle() {
            hideAuthErrors();
            try {
                if (Capacitor.isNativePlatform()) {
                    // Android natif : utilise le plugin Capacitor
                    const result = await FirebaseAuthentication.signInWithGoogle();
                    const credential = firebase.auth.GoogleAuthProvider.credential(result.credential?.idToken);
                    await auth.signInWithCredential(credential);
                } else {
                    // Web : utilise le popup classique
                    await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
                }
            } catch (e) {
                if (e.code !== 'auth/popup-closed-by-user') {
                    showAuthError('loginError', 'Erreur Google Sign-In. Réessayez.');
                }
            }
        }

        async function logout() {
            if (!confirm('Voulez-vous vous déconnecter ?')) return;
            await auth.signOut();
        }

        function openSettingsModal() {
            const email = currentUser ? (currentUser.email || currentUser.displayName || 'Compte Google') : 'Non connecté';
            document.getElementById('displayUserCode').textContent = email;
            const testPageLink = document.getElementById('testPageLink');
            testPageLink.style.display = currentUser ? 'block' : 'none';
            updateShareUI();
            // Charger la version
            fetch('version.json?' + Date.now())
                .then(r => r.json())
                .then(data => {
                    document.getElementById('appVersion').textContent = 'Version ' + data.version;
                })
                .catch(() => {
                    document.getElementById('appVersion').textContent = '';
                });
            document.getElementById('settingsModal').classList.add('show');
        }

        function closeSettingsModal() {
            document.getElementById('settingsModal').classList.remove('show');
        }

        // ========================================
        // PARTAGE DE LISTE — Fonctions
        // ========================================

        function generateShortCode() {
            const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans O,0,I,1 pour éviter confusion
            let code = '';
            for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
            return code;
        }

        function updateActiveListLabel() {
            const el = document.getElementById('activeListName');
            if (!el) return;
            if (activeListId) {
                // Liste partagée → récupérer le nom depuis Firestore
                db.collection('lists').doc(activeListId).get().then(doc => {
                    if (doc.exists && doc.data().name) {
                        el.textContent = '📋 ' + doc.data().name;
                    } else {
                        el.textContent = '📋 Liste partagée';
                    }
                    el.style.display = 'block';
                }).catch(() => {
                    el.textContent = '📋 Liste partagée';
                    el.style.display = 'block';
                });
            } else if (currentUser) {
                const userName = currentUser.displayName || currentUser.email || 'utilisateur';
                el.textContent = '📋 Liste perso de ' + userName;
                el.style.display = 'block';
            } else {
                el.style.display = 'none';
            }
        }

        function updateShareUI() {
            const sharedSection = document.getElementById('sharedListSection');
            const personalSection = document.getElementById('personalListSection');
            if (!sharedSection || !personalSection) return;

            if (activeListId) {
                sharedSection.style.display = 'block';
                personalSection.style.display = 'none';
                cancelRenameList(); // Réinitialiser le formulaire si ouvert
                // Afficher le nom de la liste active
                db.collection('lists').doc(activeListId).get().then(doc => {
                    if (doc.exists) {
                        document.getElementById('activeListName').textContent = doc.data().name || 'Liste partagée';
                    }
                }).catch(() => {});
            } else {
                sharedSection.style.display = 'none';
                personalSection.style.display = 'block';
                document.getElementById('shareCodeSection').style.display = 'none';
                // Afficher le bouton "Revenir à une liste partagée" si l'utilisateur en a
                const switchBtn = document.getElementById('switchToSharedBtn');
                if (switchBtn) {
                    switchBtn.style.display = userListMemberships.length > 0 ? 'block' : 'none';
                }
            }
        }

        function startRenameList() {
            const currentName = document.getElementById('activeListName').textContent;
            document.getElementById('renameListInput').value = currentName;
            document.getElementById('activeListNameRow').style.display = 'none';
            document.getElementById('renameListForm').style.display = 'block';
            const input = document.getElementById('renameListInput');
            input.focus();
            input.select();
        }

        async function saveRenameList() {
            const newName = document.getElementById('renameListInput').value.trim();
            if (!newName) { alert('Le nom ne peut pas être vide.'); return; }
            if (!activeListId) return;
            try {
                await db.collection('lists').doc(activeListId).update({ name: newName });
                document.getElementById('activeListName').textContent = newName;
                cancelRenameList();
            } catch (e) {
                console.error('Erreur renameList:', e);
                alert('Erreur lors de la modification du nom : ' + (e.message || e));
            }
        }

        function cancelRenameList() {
            const form = document.getElementById('renameListForm');
            const row = document.getElementById('activeListNameRow');
            if (form) form.style.display = 'none';
            if (row) row.style.display = 'flex';
        }

        async function createSharedList() {
            if (!isFirebaseReady || !userId) return;
            const listName = prompt('Nom de la liste partagée (ex: "Courses de la famille") :');
            if (!listName || !listName.trim()) return;

            const listRef = db.collection('lists').doc();
            const email = currentUser.email || currentUser.displayName || 'Utilisateur';

            await listRef.set({
                name: listName.trim(),
                groceryList: groceryList,
                meals: meals,
                mealOrder: mealOrder,
                mealSections: mealSections,
                mealSectionOrder: mealSectionOrder,
                articleSections: articleSections,
                articleSectionOrder: articleSectionOrder,
                members: [userId],
                memberEmails: { [userId]: email },
                ownerId: userId,
                presence: { [userId]: { email, lastSeen: firebase.firestore.FieldValue.serverTimestamp() } },
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Enregistrer dans le doc utilisateur
            await db.collection('users').doc(userId).set({
                listMemberships: firebase.firestore.FieldValue.arrayUnion(listRef.id)
            }, { merge: true });
            if (!userListMemberships.includes(listRef.id)) userListMemberships.push(listRef.id);

            // Générer un code court unique
            let code, codeExists = true;
            while (codeExists) {
                code = generateShortCode();
                const existing = await db.collection('inviteCodes').doc(code).get();
                codeExists = existing.exists;
            }
            await db.collection('inviteCodes').doc(code).set({
                listId: listRef.id,
                createdBy: userId,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Activer cette liste
            activeListId = listRef.id;
            subscribeToSharedList(activeListId);
            startPresenceHeartbeat();
            updateShareUI();

            // Afficher le code
            document.getElementById('shareCodeDisplay').textContent = code;
            document.getElementById('shareCodeSection').style.display = 'block';
        }

        async function joinSharedList() {
            // Rate limiting : max 5 tentatives par minute
            const now = Date.now();
            if (now - joinFirstAttemptTime > JOIN_WINDOW_MS) {
                joinAttempts = 0;
                joinFirstAttemptTime = now;
            }
            joinAttempts++;
            if (joinAttempts > JOIN_MAX_ATTEMPTS) {
                const secondsLeft = Math.ceil((JOIN_WINDOW_MS - (now - joinFirstAttemptTime)) / 1000);
                alert(`Trop de tentatives. Réessayez dans ${secondsLeft} secondes.`);
                return;
            }

            const code = (document.getElementById('joinCodeInput').value || '').trim().toUpperCase();
            if (!code || code.length !== 6) { alert('Entrez un code de 6 caractères.'); return; }

            try {
                const codeDoc = await db.collection('inviteCodes').doc(code).get();
                if (!codeDoc.exists) { alert('Code invalide. Vérifiez et réessayez.'); return; }

                const listId = codeDoc.data().listId;

                // Vérifier si déjà membre
                if (userListMemberships.includes(listId)) {
                    activeListId = listId;
                    subscribeToSharedList(activeListId);
                    startPresenceHeartbeat();
                    updateShareUI();
                    updateActiveListLabel();
                    document.getElementById('joinCodeInput').value = '';
                    closeSettingsModal();
                    return;
                }

                const email = currentUser.email || currentUser.displayName || 'Utilisateur';
                await db.collection('lists').doc(listId).update({
                    members: firebase.firestore.FieldValue.arrayUnion(userId),
                    [`memberEmails.${userId}`]: email,
                    [`presence.${userId}.email`]: email,
                    [`presence.${userId}.lastSeen`]: firebase.firestore.FieldValue.serverTimestamp()
                });

                await db.collection('users').doc(userId).set({
                    listMemberships: firebase.firestore.FieldValue.arrayUnion(listId)
                }, { merge: true });
                if (!userListMemberships.includes(listId)) userListMemberships.push(listId);

                activeListId = listId;
                document.getElementById('joinCodeInput').value = '';
                subscribeToSharedList(activeListId);
                startPresenceHeartbeat();
                updateShareUI();
                updateActiveListLabel();
                closeSettingsModal();
            } catch (e) {
                console.error('Erreur joinSharedList:', e);
                if (e.code === 'permission-denied') {
                    alert('❌ Permissions insuffisantes.\n\nAssurez-vous que les règles Firestore ont été mises à jour dans la console Firebase (voir CLAUDE.md).');
                } else {
                    alert('Erreur lors de la connexion à la liste : ' + (e.message || e));
                }
            }
        }

        async function leaveSharedList() {
            if (!confirm('Quitter cette liste partagée ? Vos modifications resteront pour les autres membres.')) return;
            const leavingId = activeListId;

            await updatePresence(false);
            await db.collection('lists').doc(leavingId).update({
                members: firebase.firestore.FieldValue.arrayRemove(userId)
            });
            await db.collection('users').doc(userId).set({
                listMemberships: firebase.firestore.FieldValue.arrayRemove(leavingId),
                defaultListId: firebase.firestore.FieldValue.delete()
            }, { merge: true });
            userListMemberships = userListMemberships.filter(id => id !== leavingId);

            activeListId = null;
            if (listUnsubscribe) { listUnsubscribe(); listUnsubscribe = null; }
            stopPresenceHeartbeat();

            await initializeDefaultItems();
            renderCategories();
            renderMeals();
            updateShareUI();
            updateActiveListLabel();
        }

        async function showShareCode() {
            if (!activeListId) return;
            try {
                const codeSnap = await db.collection('inviteCodes')
                    .where('listId', '==', activeListId).limit(1).get();
                if (!codeSnap.empty) {
                    document.getElementById('shareCodeDisplay').textContent = codeSnap.docs[0].id;
                    document.getElementById('shareCodeSection').style.display = 'block';
                } else {
                    alert('Aucun code trouvé pour cette liste.');
                }
            } catch (e) {
                console.error('Erreur showShareCode:', e);
            }
        }

        function copyShareCode() {
            const code = document.getElementById('shareCodeDisplay').textContent;
            if (!code) return;
            navigator.clipboard.writeText(code)
                .then(() => alert('✅ Code "' + code + '" copié !'))
                .catch(() => alert('Code : ' + code));
        }

        async function changeListDefault() {
            if (!activeListId) return;
            await db.collection('users').doc(userId).set({
                defaultListId: activeListId
            }, { merge: true });
            alert('✅ Cette liste s\'ouvrira par défaut à la prochaine connexion.');
        }

        let previousListId = null; // Pour restaurer en cas d'annulation

        async function switchList() {
            closeSettingsModal();
            previousListId = activeListId;
            if (listUnsubscribe) { listUnsubscribe(); listUnsubscribe = null; }
            stopPresenceHeartbeat();
            activeListId = null;
            await showListPicker();
        }

        async function showListPicker() {
            if (!isFirebaseReady || userListMemberships.length === 0) {
                // Pas de listes partagées, ouvrir la liste personnelle directement
                await initializeDefaultItems();
                renderCategories();
                renderMeals();
                updateShareUI();
                return;
            }

            const listDocs = await Promise.all(
                userListMemberships.map(id => db.collection('lists').doc(id).get())
            );

            const container = document.getElementById('listPickerItems');
            const validDocs = listDocs.filter(doc => doc.exists && doc.data().members && doc.data().members.includes(userId));

            container.innerHTML = validDocs.map(doc => {
                const data = doc.data();
                const memberCount = (data.members || []).length;
                return `<div class="list-picker-item" onclick="selectList('${doc.id}')">
                    <span class="list-picker-icon">📋</span>
                    <div>
                        <div class="list-picker-name">${escapeHtml(data.name || 'Liste sans nom')}</div>
                        <div class="list-picker-members">${memberCount} membre${memberCount > 1 ? 's' : ''}</div>
                    </div>
                </div>`;
            }).join('') + `
                <div class="list-picker-item" onclick="selectList(null)">
                    <span class="list-picker-icon">👤</span>
                    <div>
                        <div class="list-picker-name">Ma liste personnelle</div>
                        <div class="list-picker-members">Utilisation privée</div>
                    </div>
                </div>`;

            document.getElementById('listPickerModal').classList.add('show');
        }

        function closeListPicker() {
            document.getElementById('listPickerModal').classList.remove('show');
            if (!activeListId && previousListId) {
                // Annulation depuis switchList → restaurer la liste précédente
                activeListId = previousListId;
                previousListId = null;
                subscribeToSharedList(activeListId);
                updatePresence(true);
                startPresenceHeartbeat();
                renderCategories();
                renderMeals();
                updateShareUI();
                updateActiveListLabel();
            } else if (!activeListId) {
                // Pas de liste active (ex: premier login) → liste personnelle
                initializeDefaultItems().then(() => {
                    renderCategories();
                    renderMeals();
                    updateArticlesCollapseState();
                    updateShareUI();
                    updateActiveListLabel();
                });
            }
            previousListId = null;
        }

        async function selectList(listId) {
            document.getElementById('listPickerModal').classList.remove('show');
            previousListId = null;
            activeListId = listId || null;

            if (activeListId) {
                if (confirm('Définir cette liste comme liste par défaut ?')) {
                    await db.collection('users').doc(userId).set({
                        defaultListId: activeListId
                    }, { merge: true });
                }
                subscribeToSharedList(activeListId);
                await updatePresence(true);
                startPresenceHeartbeat();
            } else {
                // Effacer le défaut si on choisit la liste perso
                await db.collection('users').doc(userId).set({
                    defaultListId: null
                }, { merge: true });
                await initializeDefaultItems();
            }

            renderCategories();
            renderMeals();
            updateArticlesCollapseState();
            updateShareUI();
            updateActiveListLabel();
        }

        // Présence
        async function updatePresence(online) {
            if (!isFirebaseReady || !activeListId || !userId || !db) return;
            try {
                const presenceData = {
                    [`presence.${userId}.email`]: currentUser.email || currentUser.displayName || 'Utilisateur',
                    [`presence.${userId}.lastSeen`]: online
                        ? firebase.firestore.FieldValue.serverTimestamp()
                        : new Date(0)
                };
                await db.collection('lists').doc(activeListId).update(presenceData);
            } catch (e) { /* Silencieux */ }
        }

        function startPresenceHeartbeat() {
            stopPresenceHeartbeat();
            presenceInterval = setInterval(() => updatePresence(true), 60000);
        }

        function stopPresenceHeartbeat() {
            if (presenceInterval) { clearInterval(presenceInterval); presenceInterval = null; }
        }

        function renderPresenceIndicators(presence, memberEmails) {
            const container = document.getElementById('presenceContainer');
            if (!container || !presence) return;
            const now = Date.now();
            const threshold = 3 * 60 * 1000; // 3 minutes

            const html = Object.entries(presence).map(([uid, data]) => {
                const lastSeen = data.lastSeen && data.lastSeen.toMillis ? data.lastSeen.toMillis() : 0;
                const isOnline = (now - lastSeen) < threshold;
                const email = data.email || memberEmails?.[uid] || 'Utilisateur';
                const name = email.split('@')[0];
                const isMe = uid === userId;
                return `<span class="presence-dot ${isOnline ? 'online' : 'offline'}" title="${escapeHtml(email)}">
                    ● ${escapeHtml(name)}${isMe ? ' (vous)' : ''}
                </span>`;
            }).join('');

            container.innerHTML = html;
        }

        // onSnapshot — abonnement temps réel à une liste partagée
        function subscribeToSharedList(listId) {
            if (listUnsubscribe) listUnsubscribe();

            listUnsubscribe = db.collection('lists').doc(listId).onSnapshot((doc) => {
                if (!doc.exists) return;
                const data = doc.data();

                if (data.groceryList) {
                    groceryList = data.groceryList;
                    localStorage.setItem('groceryList', JSON.stringify(groceryList));
                }
                if (data.meals) {
                    meals = data.meals;
                    localStorage.setItem('meals', JSON.stringify(meals));
                }
                if (data.mealOrder) {
                    mealOrder = data.mealOrder;
                    localStorage.setItem('mealOrder', JSON.stringify(mealOrder));
                }
                if (data.mealSections) {
                    mealSections = data.mealSections;
                    localStorage.setItem('mealSections', JSON.stringify(mealSections));
                }
                if (data.mealSectionOrder) {
                    mealSectionOrder = data.mealSectionOrder;
                    localStorage.setItem('mealSectionOrder', JSON.stringify(mealSectionOrder));
                }
                if (data.articleSections) {
                    articleSections = data.articleSections;
                    localStorage.setItem('articleSections', JSON.stringify(articleSections));
                }
                if (data.articleSectionOrder) {
                    articleSectionOrder = data.articleSectionOrder;
                    localStorage.setItem('articleSectionOrder', JSON.stringify(articleSectionOrder));
                }
                ensureArticleSections();
                dataLoaded = true;

                renderCategories();
                renderMeals();

                if (data.presence) {
                    renderPresenceIndicators(data.presence, data.memberEmails);
                }

                updateSyncStatus('synced');
            }, (error) => {
                console.error('onSnapshot error:', error);
                updateSyncStatus('error');
            });
        }

        async function checkListMembership(listId) {
            try {
                const doc = await db.collection('lists').doc(listId).get();
                const isMember = doc.exists && (doc.data().members || []).includes(userId);
                console.log(`🔍 checkListMembership(${listId}): ${isMember ? 'membre' : 'pas membre'}`);
                return isMember;
            } catch (e) {
                // Erreur réseau → on refuse l'accès par sécurité (fail secure)
                console.warn('⚠️ checkListMembership erreur réseau, accès refusé:', e);
                return false;
            }
        }

        // Initialize Firebase when the page loads
        try {
            firebase.initializeApp(firebaseConfig);
            db = firebase.firestore();
            auth = firebase.auth();
            auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
            console.log('✅ Firebase initialisé');
        } catch (error) {
            console.error('❌ Erreur Firebase:', error);
            isFirebaseReady = false;
        }

        // ========================================
        // APPLICATION DATA
        // ========================================
        const CATEGORIES = {
            'fruits': { name: 'Fruits', icon: '🍎', items: [] },
            'legumes': { name: 'Légumes', icon: '🥬', items: [] },
            'viande': { name: 'Viande', icon: '🥩', items: [] },
            'poisson': { name: 'Poisson', icon: '🐟', items: [] },
            'produits-laitiers': { name: 'Produits Laitiers', icon: '🥛', items: ['Lait', 'Yaourts', 'Fromage', 'Beurre', 'Oeufs'] },
            'epicerie': { name: 'Épicerie', icon: '🥫', items: ['Pâtes', 'Riz', 'Huile', 'Sauce tomate', 'Sel', 'Poivre', 'Sucre', 'Farine'] },
            'boulangerie': { name: 'Boulangerie', icon: '🥖', items: ['Pain', 'Croissants', 'Brioche'] },
            'surgeles': { name: 'Surgelés', icon: '❄️', items: ['Pizza', 'Légumes surgelés', 'Glace'] },
            'boissons': { name: 'Boissons', icon: '🥤', items: ['Eau', 'Jus d\'orange', 'Café', 'Thé', 'Soda'] },
            'hygiene': { name: 'Hygiène & Entretien', icon: '🧴', items: ['Savon', 'Shampoing', 'Dentifrice', 'Lessive', 'Papier toilette'] },
            'autre': { name: 'Autre', icon: '📦', items: [] }
        };

        // Migration: seed articleSections from CATEGORIES if empty
        function ensureArticleSections() {
            if (articleSectionOrder.length === 0 && Object.keys(articleSections).length === 0) {
                Object.keys(CATEGORIES).forEach(key => {
                    articleSections[key] = { name: CATEGORIES[key].name, icon: CATEGORIES[key].icon };
                    articleSectionOrder.push(key);
                });
            }
            // Cleanup: remove sections that no longer exist
            articleSectionOrder = articleSectionOrder.filter(id => articleSections[id]);
            // Add any sections in articleSections not in order
            Object.keys(articleSections).forEach(id => {
                if (!articleSectionOrder.includes(id)) {
                    articleSectionOrder.push(id);
                }
            });
        }

        let groceryList = {};
        let currentFilter = 'all';
        let searchTerm = '';
        let collapsedCategories = {};
        let meals = {};
        let mealOrder = [];              // Ordre d'affichage des plats (IDs)
        let mealSections = {};           // { sectionId: { name: "Plats italiens" } }
        let mealSectionOrder = [];       // Ordre d'affichage des sections
        let collapsedMealSections = {};  // { sectionId: true/false }
        let mealSearchTerm = '';
        // Rate limiting pour les codes d'invitation
        let joinAttempts = 0;
        let joinFirstAttemptTime = 0;
        const JOIN_MAX_ATTEMPTS = 5;
        const JOIN_WINDOW_MS = 60000; // 1 minute
        let articleSections = {};        // { sectionId: { name, icon } }
        let articleSectionOrder = [];    // Ordre d'affichage des sections articles
        let mealsCollapsed = false;
        let articlesCollapsed = false;

        // Initialize with some default items
        async function initializeDefaultItems() {
            const savedCollapsed = localStorage.getItem('collapsedCategories');
            const saved = localStorage.getItem('groceryList');
            const savedMeals = localStorage.getItem('meals');
            const savedMealSections = localStorage.getItem('mealSections');
            const savedMealOrder = localStorage.getItem('mealOrder');
            const savedMealSectionOrder = localStorage.getItem('mealSectionOrder');
            const savedArticleSections = localStorage.getItem('articleSections');
            const savedArticleSectionOrder = localStorage.getItem('articleSectionOrder');
            const savedCollapsedMealSections = localStorage.getItem('collapsedMealSections');
            const savedMealsCollapsed = localStorage.getItem('mealsCollapsed');
            const savedArticlesCollapsed = localStorage.getItem('articlesCollapsed');
            
            if (savedCollapsed) {
                try { collapsedCategories = JSON.parse(savedCollapsed); } catch (e) { console.warn('⚠️ collapsedCategories corrompu, reset:', e); }
            }

            if (savedMealsCollapsed !== null) {
                mealsCollapsed = savedMealsCollapsed === 'true';
            }

            if (savedArticlesCollapsed !== null) {
                articlesCollapsed = savedArticlesCollapsed === 'true';
            }

            // Try to load from Firebase first (only works on HTTPS)
            const loadedFromFirebase = await loadFromFirebase();
            
            if (loadedFromFirebase) {
                console.log('✅ Données chargées depuis Firebase');
                ensureArticleSections();
                return;
            }

            // If no Firebase data, load from localStorage
            console.log('📂 Chargement depuis localStorage...');
            
            try {
                if (savedMeals) meals = JSON.parse(savedMeals);
                if (savedMealOrder) mealOrder = JSON.parse(savedMealOrder);
                if (savedMealSections) mealSections = JSON.parse(savedMealSections);
                if (savedMealSectionOrder) mealSectionOrder = JSON.parse(savedMealSectionOrder);
                if (savedCollapsedMealSections) collapsedMealSections = JSON.parse(savedCollapsedMealSections);
                if (savedArticleSections) articleSections = JSON.parse(savedArticleSections);
                if (savedArticleSectionOrder) articleSectionOrder = JSON.parse(savedArticleSectionOrder);
            } catch (e) {
                console.warn('⚠️ Données localStorage corrompues, utilisation des valeurs par défaut:', e);
            }

            if (saved) {
                try { groceryList = JSON.parse(saved); } catch (e) { console.warn('⚠️ groceryList corrompu, reset:', e); }
                
                // Migration: split old combined categories into new separate ones
                if (groceryList['fruits-legumes']) {
                    // Separate fruits and vegetables
                    const fruitsKeywords = ['citron', 'lime', 'orange', 'pomme', 'banane', 'baie', 'fraise', 'myrtille', 'framboise', 'raisin', 'mangue', 'ananas', 'avocat', 'kiwi', 'poire'];
                    
                    groceryList['fruits'] = groceryList['fruits'] || [];
                    groceryList['legumes'] = groceryList['legumes'] || [];
                    
                    groceryList['fruits-legumes'].forEach(item => {
                        const itemLower = item.name.toLowerCase();
                        const isFruit = fruitsKeywords.some(keyword => itemLower.includes(keyword));
                        
                        if (isFruit) {
                            groceryList['fruits'].push(item);
                        } else {
                            groceryList['legumes'].push(item);
                        }
                    });
                    
                    delete groceryList['fruits-legumes'];
                }
                
                if (groceryList['viande-poisson']) {
                    // Separate meat and fish
                    const fishKeywords = ['saumon', 'thon', 'crevette', 'moule', 'cabillaud', 'poisson'];
                    
                    groceryList['viande'] = groceryList['viande'] || [];
                    groceryList['poisson'] = groceryList['poisson'] || [];
                    
                    groceryList['viande-poisson'].forEach(item => {
                        const itemLower = item.name.toLowerCase();
                        const isFish = fishKeywords.some(keyword => itemLower.includes(keyword));
                        
                        if (isFish) {
                            groceryList['poisson'].push(item);
                        } else {
                            groceryList['viande'].push(item);
                        }
                    });
                    
                    delete groceryList['viande-poisson'];
                }

                dataLoaded = true;
                saveToLocalStorage();
            } else {
                // Add items from user's list
                let idCounter = Date.now();
                groceryList = {
                    'fruits': [
                        { name: 'Citrons', checked: false, id: idCounter++ },
                        { name: 'Limes', checked: false, id: idCounter++ },
                        { name: 'Oranges', checked: false, id: idCounter++ },
                        { name: 'Pommes', checked: false, id: idCounter++ },
                        { name: 'Bananes', checked: false, id: idCounter++ },
                        { name: 'Baies (fraises, myrtilles, framboises)', checked: false, id: idCounter++ },
                        { name: 'Raisins', checked: false, id: idCounter++ },
                        { name: 'Mangues', checked: false, id: idCounter++ },
                        { name: 'Ananas', checked: false, id: idCounter++ },
                        { name: 'Avocats', checked: false, id: idCounter++ },
                        { name: 'Kiwis', checked: false, id: idCounter++ },
                        { name: 'Poires', checked: false, id: idCounter++ }
                    ],
                    'legumes': [
                        { name: 'Tomates', checked: false, id: idCounter++ },
                        { name: 'Brocoli', checked: false, id: idCounter++ },
                        { name: 'Poivrons', checked: false, id: idCounter++ },
                        { name: 'Oignon', checked: false, id: idCounter++ },
                        { name: 'Ail', checked: false, id: idCounter++ },
                        { name: 'Pommes de terre', checked: false, id: idCounter++ },
                        { name: 'Patates douces', checked: false, id: idCounter++ },
                        { name: 'Carottes', checked: false, id: idCounter++ },
                        { name: 'Poireaux', checked: false, id: idCounter++ },
                        { name: 'Céleri', checked: false, id: idCounter++ },
                        { name: 'Choux de Bruxelles', checked: false, id: idCounter++ },
                        { name: 'Champignons', checked: false, id: idCounter++ },
                        { name: 'Courgettes', checked: false, id: idCounter++ },
                        { name: 'Aubergines', checked: false, id: idCounter++ },
                        { name: 'Betteraves', checked: false, id: idCounter++ },
                        { name: 'Concombre', checked: false, id: idCounter++ },
                        { name: 'Salade/Laitue', checked: false, id: idCounter++ },
                        { name: 'Épinards', checked: false, id: idCounter++ },
                        { name: 'Roquette', checked: false, id: idCounter++ },
                        { name: 'Herbes fraîches (basilic, persil, coriandre)', checked: false, id: idCounter++ }
                    ],
                    'viande': [
                        { name: 'Poulet (entier, cuisses, poitrines)', checked: false, id: idCounter++ },
                        { name: 'Bœuf haché', checked: false, id: idCounter++ },
                        { name: 'Steaks', checked: false, id: idCounter++ },
                        { name: 'Porc (côtelettes, rôti)', checked: false, id: idCounter++ },
                        { name: 'Saucisses', checked: false, id: idCounter++ },
                        { name: 'Bacon', checked: false, id: idCounter++ },
                        { name: 'Agneau', checked: false, id: idCounter++ },
                        { name: 'Dinde', checked: false, id: idCounter++ }
                    ],
                    'poisson': [
                        { name: 'Saumon', checked: false, id: idCounter++ },
                        { name: 'Thon', checked: false, id: idCounter++ },
                        { name: 'Crevettes', checked: false, id: idCounter++ },
                        { name: 'Moules', checked: false, id: idCounter++ },
                        { name: 'Cabillaud ou autre poisson blanc', checked: false, id: idCounter++ }
                    ],
                    'produits-laitiers': [
                        { name: 'Lait (entier, écrémé, alternatif)', checked: false, id: idCounter++ },
                        { name: 'Crème fraîche/Crème liquide', checked: false, id: idCounter++ },
                        { name: 'Beurre', checked: false, id: idCounter++ },
                        { name: 'Yaourt nature', checked: false, id: idCounter++ },
                        { name: 'Yaourt grec', checked: false, id: idCounter++ },
                        { name: 'Fromage (cheddar, mozzarella, parmesan)', checked: false, id: idCounter++ },
                        { name: 'Fromage blanc/Cottage cheese', checked: false, id: idCounter++ },
                        { name: 'Œufs', checked: false, id: idCounter++ }
                    ],
                    'epicerie': [
                        { name: 'Pain', checked: false, id: idCounter++ },
                        { name: 'Pâtes', checked: false, id: idCounter++ },
                        { name: 'Riz (blanc, brun, basmati)', checked: false, id: idCounter++ },
                        { name: 'Quinoa', checked: false, id: idCounter++ },
                        { name: 'Couscous', checked: false, id: idCounter++ },
                        { name: 'Farine', checked: false, id: idCounter++ },
                        { name: 'Sucre', checked: false, id: idCounter++ },
                        { name: 'Cassonade', checked: false, id: idCounter++ },
                        { name: 'Levure chimique', checked: false, id: idCounter++ },
                        { name: 'Bicarbonate de soude', checked: false, id: idCounter++ },
                        { name: 'Sel', checked: false, id: idCounter++ },
                        { name: 'Poivre noir', checked: false, id: idCounter++ },
                        { name: 'Flocons d\'avoine', checked: false, id: idCounter++ },
                        { name: 'Céréales', checked: false, id: idCounter++ },
                        { name: 'Pâte à tartiner', checked: false, id: idCounter++ },
                        { name: 'Confiture', checked: false, id: idCounter++ },
                        { name: 'Miel', checked: false, id: idCounter++ },
                        { name: 'Beurre de cacahuète', checked: false, id: idCounter++ },
                        { name: 'Huile d\'olive', checked: false, id: idCounter++ },
                        { name: 'Huile végétale', checked: false, id: idCounter++ },
                        { name: 'Vinaigre (balsamique, de vin)', checked: false, id: idCounter++ },
                        { name: 'Sauce soja', checked: false, id: idCounter++ },
                        { name: 'Ketchup', checked: false, id: idCounter++ },
                        { name: 'Moutarde', checked: false, id: idCounter++ },
                        { name: 'Mayonnaise', checked: false, id: idCounter++ },
                        { name: 'Pâte de tomate', checked: false, id: idCounter++ },
                        { name: 'Tomates en conserve', checked: false, id: idCounter++ },
                        { name: 'Haricots en conserve (noirs, rouges, blancs)', checked: false, id: idCounter++ },
                        { name: 'Pois chiches', checked: false, id: idCounter++ },
                        { name: 'Lentilles', checked: false, id: idCounter++ },
                        { name: 'Bouillon (légumes, poulet, bœuf)', checked: false, id: idCounter++ },
                        { name: 'Lait de coco', checked: false, id: idCounter++ },
                        { name: 'Noix (amandes, noix de cajou, noix)', checked: false, id: idCounter++ },
                        { name: 'Graines (chia, lin, tournesol)', checked: false, id: idCounter++ },
                        { name: 'Chocolat noir', checked: false, id: idCounter++ },
                        { name: 'Pépites de chocolat', checked: false, id: idCounter++ },
                        { name: 'Thon en conserve', checked: false, id: idCounter++ },
                        { name: 'Sardines', checked: false, id: idCounter++ },
                        { name: 'Cornichons', checked: false, id: idCounter++ },
                        { name: 'Olives', checked: false, id: idCounter++ }
                    ],
                    'surgeles': [
                        { name: 'Légumes surgelés (pois, maïs, haricots verts)', checked: false, id: idCounter++ },
                        { name: 'Fruits surgelés (baies)', checked: false, id: idCounter++ },
                        { name: 'Pizza surgelée', checked: false, id: idCounter++ },
                        { name: 'Glace', checked: false, id: idCounter++ }
                    ],
                    'boissons': [
                        { name: 'Eau en bouteille/eau gazeuse', checked: false, id: idCounter++ },
                        { name: 'Jus (orange, pomme)', checked: false, id: idCounter++ },
                        { name: 'Café', checked: false, id: idCounter++ },
                        { name: 'Thé (noir, vert, tisanes)', checked: false, id: idCounter++ },
                        { name: 'Sodas', checked: false, id: idCounter++ },
                        { name: 'Bière/Vin', checked: false, id: idCounter++ }
                    ],
                    'hygiene': [
                        { name: 'Papier toilette', checked: false, id: idCounter++ },
                        { name: 'Essuie-tout', checked: false, id: idCounter++ },
                        { name: 'Mouchoirs', checked: false, id: idCounter++ },
                        { name: 'Savon à vaisselle', checked: false, id: idCounter++ },
                        { name: 'Lessive', checked: false, id: idCounter++ },
                        { name: 'Sacs poubelle', checked: false, id: idCounter++ },
                        { name: 'Éponges', checked: false, id: idCounter++ },
                        { name: 'Film alimentaire', checked: false, id: idCounter++ },
                        { name: 'Papier aluminium', checked: false, id: idCounter++ },
                        { name: 'Sacs de congélation', checked: false, id: idCounter++ },
                        { name: 'Dentifrice', checked: false, id: idCounter++ },
                        { name: 'Brosses à dents', checked: false, id: idCounter++ },
                        { name: 'Shampoing', checked: false, id: idCounter++ },
                        { name: 'Après-shampoing', checked: false, id: idCounter++ },
                        { name: 'Gel douche', checked: false, id: idCounter++ },
                        { name: 'Déodorant', checked: false, id: idCounter++ },
                        { name: 'Rasoirs', checked: false, id: idCounter++ },
                        { name: 'Crème à raser', checked: false, id: idCounter++ }
                    ],
                    'autre': [
                        { name: 'Nourriture pour animaux (si applicable)', checked: false, id: idCounter++ },
                        { name: 'Serviettes en papier', checked: false, id: idCounter++ },
                        { name: 'Bougies', checked: false, id: idCounter++ },
                        { name: 'Allumettes/Briquets', checked: false, id: idCounter++ },
                        { name: 'Piles', checked: false, id: idCounter++ }
                    ]
                };
                dataLoaded = true;
                saveToLocalStorage();
            }
            dataLoaded = true;
            ensureArticleSections();
        }

        let saveTimeout = null; // Timer for debouncing

        // Sauvegarde locale uniquement (état d'affichage — pas de sync Firebase)
        function saveCollapseState() {
            localStorage.setItem('collapsedCategories', JSON.stringify(collapsedCategories));
            localStorage.setItem('collapsedMealSections', JSON.stringify(collapsedMealSections));
            localStorage.setItem('mealsCollapsed', mealsCollapsed.toString());
            localStorage.setItem('articlesCollapsed', articlesCollapsed.toString());
        }

        function saveToLocalStorage() {
            if (!dataLoaded) return; // Ne pas sauvegarder tant que les données n'ont pas été chargées
            // Save to localStorage (backup) - IMMEDIATE
            localStorage.setItem('groceryList', JSON.stringify(groceryList));
            localStorage.setItem('meals', JSON.stringify(meals));
            localStorage.setItem('mealOrder', JSON.stringify(mealOrder));
            localStorage.setItem('mealSections', JSON.stringify(mealSections));
            localStorage.setItem('mealSectionOrder', JSON.stringify(mealSectionOrder));
            localStorage.setItem('articleSections', JSON.stringify(articleSections));
            localStorage.setItem('articleSectionOrder', JSON.stringify(articleSectionOrder));
            
            // Show "pending" status immediately
            updateSyncStatus('pending');
            
            // Cancel previous timer if exists
            clearTimeout(saveTimeout);
            
            // Wait 5 seconds before saving to Firebase
            saveTimeout = setTimeout(() => {
                saveToFirebase();
            }, 1000); // 1 second debouncing
        }

        async function saveToFirebase() {
            if (!dataLoaded) {
                console.warn('⚠️ saveToFirebase bloqué: dataLoaded=false');
                return;
            }
            if (!isFirebaseReady || !db || !userId) {
                console.warn('⚠️ saveToFirebase bloqué: isFirebaseReady=' + isFirebaseReady + ', db=' + !!db + ', userId=' + !!userId);
                updateSyncStatus('offline');
                return;
            }

            try {
                updateSyncStatus('syncing');

                const dataToSave = {
                    groceryList: groceryList,
                    meals: meals,
                    mealOrder: mealOrder,
                    mealSections: mealSections,
                    mealSectionOrder: mealSectionOrder,
                    articleSections: articleSections,
                    articleSectionOrder: articleSectionOrder,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                };

                if (activeListId) {
                    // Liste partagée → écrire dans lists/{activeListId} + mettre à jour présence
                    dataToSave[`presence.${userId}.lastSeen`] = firebase.firestore.FieldValue.serverTimestamp();
                    await db.collection('lists').doc(activeListId).set(dataToSave, { merge: true });
                } else {
                    // Liste personnelle → écrire dans users/{userId}
                    await db.collection('users').doc(userId).set(dataToSave, { merge: true });
                }

                console.log('✅ Données sauvegardées sur Firebase');
                updateSyncStatus('synced');
            } catch (error) {
                console.error('❌ Erreur de sauvegarde Firebase:', error);
                updateSyncStatus('error');
            }
        }

        function updateSyncStatus(status) {
            const iconEl = document.getElementById('syncIcon');
            const textEl = document.getElementById('syncText');
            
            if (!iconEl || !textEl) return;
            
            switch(status) {
                case 'pending':
                    iconEl.textContent = '💾';
                    textEl.textContent = 'Modifications en attente...';
                    break;
                case 'syncing':
                    iconEl.textContent = '🔄';
                    textEl.textContent = 'Synchronisation...';
                    break;
                case 'synced':
                    iconEl.textContent = '✅';
                    textEl.textContent = 'Sauvegardé dans le cloud';
                    setTimeout(() => {
                        iconEl.textContent = '☁️';
                        textEl.textContent = 'Connecté';
                    }, 2000);
                    break;
                case 'offline':
                    iconEl.textContent = '💾';
                    textEl.textContent = 'Sauvegarde locale uniquement';
                    break;
                case 'error':
                    iconEl.textContent = '⚠️';
                    textEl.textContent = 'Erreur de synchronisation';
                    break;
            }
        }

        async function loadFromFirebase() {
            if (!isFirebaseReady || !db || !userId) {
                console.log('Firebase non disponible, chargement depuis localStorage');
                updateSyncStatus('offline');
                return false;
            }

            try {
                updateSyncStatus('syncing');
                const doc = await db.collection('users').doc(userId).get();
                
                if (doc.exists) {
                    const data = doc.data();
                    console.log('📥 Données chargées depuis Firebase');
                    
                    if (data.groceryList) groceryList = data.groceryList;
                    if (data.meals) meals = data.meals;
                    if (data.mealOrder) mealOrder = data.mealOrder;
                    if (data.mealSections) mealSections = data.mealSections;
                    if (data.mealSectionOrder) mealSectionOrder = data.mealSectionOrder;
                    if (data.articleSections) articleSections = data.articleSections;
                    if (data.articleSectionOrder) articleSectionOrder = data.articleSectionOrder;
                    ensureArticleSections();

                    // Save to localStorage as backup
                    localStorage.setItem('groceryList', JSON.stringify(groceryList));
                    localStorage.setItem('meals', JSON.stringify(meals));
                    localStorage.setItem('mealOrder', JSON.stringify(mealOrder));
                    localStorage.setItem('mealSections', JSON.stringify(mealSections));
                    localStorage.setItem('mealSectionOrder', JSON.stringify(mealSectionOrder));
                    localStorage.setItem('articleSections', JSON.stringify(articleSections));
                    localStorage.setItem('articleSectionOrder', JSON.stringify(articleSectionOrder));

                    dataLoaded = true;
                    updateSyncStatus('synced');
                    return true;
                } else {
                    console.log('Aucune donnée Firebase, utilisation localStorage');
                    updateSyncStatus('offline');
                    return false;
                }
            } catch (error) {
                console.error('❌ Erreur de chargement Firebase:', error);
                updateSyncStatus('error');
                return false;
            }
        }

        function toggleCategory(categoryKey) {
            toggleArticleSection(categoryKey);
        }

        function toggleAllCategories() {
            const btn = document.getElementById('collapseAllBtn');
            const allCollapsed = articleSectionOrder.every(key => collapsedCategories[key]);

            // Toggle all categories
            articleSectionOrder.forEach(categoryKey => {
                collapsedCategories[categoryKey] = !allCollapsed;
            });
            
            // Update button state
            if (!allCollapsed) {
                btn.classList.add('collapsed');
                btn.textContent = '⬍';
                btn.title = 'Déplier tout';
            } else {
                btn.classList.remove('collapsed');
                btn.textContent = '⬍';
                btn.title = 'Replier tout';
            }

            saveCollapseState();
            renderCategories();
        }

        function openAddArticleModal(prefillName) {
            const modal = document.getElementById('addArticleModal');
            const nameInput = document.getElementById('modalArticleName');
            const categorySelect = document.getElementById('modalArticleCategory');

            // Populate select dynamically from articleSections
            let optionsHtml = '<option value="">Sélectionnez une section...</option>';
            articleSectionOrder.forEach(key => {
                const section = articleSections[key];
                if (section) {
                    optionsHtml += `<option value="${key}">${section.icon} ${escapeHtml(section.name)}</option>`;
                }
            });
            categorySelect.innerHTML = optionsHtml;

            nameInput.value = prefillName || '';
            categorySelect.value = '';
            modal.classList.add('show');

            setTimeout(() => {
                if (prefillName) {
                    categorySelect.focus();
                } else {
                    nameInput.focus();
                }
            }, 100);
        }

        function closeAddArticleModal() {
            const modal = document.getElementById('addArticleModal');
            modal.classList.remove('show');
        }

        function confirmAddArticle() {
            const nameInput = document.getElementById('modalArticleName');
            const categorySelect = document.getElementById('modalArticleCategory');
            
            const itemName = nameInput.value.trim();
            const category = categorySelect.value;
            
            if (!itemName) {
                alert('Veuillez entrer un nom pour l\'article');
                return;
            }
            
            if (!category) {
                alert('Veuillez sélectionner une catégorie');
                return;
            }
            
            addItem(itemName, category);
            closeAddArticleModal();
        }

        function addItem(itemName, category) {
            if (!itemName.trim()) return;
            
            if (!groceryList[category]) {
                groceryList[category] = [];
            }

            groceryList[category].push({
                name: itemName.trim(),
                checked: false,
                id: Date.now()
            });

            saveToLocalStorage();
            renderCategories();
        }

        function toggleItem(category, itemId) {
            const item = groceryList[category].find(i => i.id === itemId);
            if (item) {
                item.checked = !item.checked;
                saveToLocalStorage();
                renderCategories();
            }
        }

        function deleteItem(category, itemId) {
            // Check if this item is used in any meals
            const usedInMeals = [];
            Object.keys(meals).forEach(mealId => {
                const meal = meals[mealId];
                const isUsed = meal.ingredients.some(ing => 
                    ing.category === category && String(ing.itemId) === String(itemId)
                );
                if (isUsed) {
                    usedInMeals.push(meal.name);
                }
            });

            // If item is used in meals, show warning
            if (usedInMeals.length > 0) {
                const mealsList = usedInMeals.join(', ');
                const confirmMessage = `⚠️ Cet article est utilisé dans ${usedInMeals.length} plat(s) :\n\n${mealsList}\n\nVoulez-vous vraiment le supprimer ?`;
                
                if (!confirm(confirmMessage)) {
                    return; // User cancelled
                }
            }

            // Proceed with deletion
            groceryList[category] = groceryList[category].filter(i => i.id !== itemId);
            if (groceryList[category].length === 0) {
                delete groceryList[category];
            }
            saveToLocalStorage();
            renderCategories();
        }

        // Move item modal functions
        let currentMoveItem = null;

        function openMoveModal(fromCategory, itemId) {
            currentMoveItem = { fromCategory, itemId };
            const modal = document.getElementById('moveModal');
            const categoriesContainer = document.getElementById('modalCategories');
            
            // Build category buttons (exclude current category)
            categoriesContainer.innerHTML = '';
            articleSectionOrder.forEach(categoryKey => {
                if (categoryKey !== fromCategory) {
                    const section = articleSections[categoryKey];
                    if (!section) return;
                    const btn = document.createElement('button');
                    btn.className = 'modal-category-btn';
                    btn.innerHTML = `${section.icon} ${section.name}`;
                    btn.onclick = () => moveItemToCategory(categoryKey);
                    categoriesContainer.appendChild(btn);
                }
            });
            
            modal.classList.add('show');
        }

        function closeMoveModal() {
            const modal = document.getElementById('moveModal');
            modal.classList.remove('show');
            currentMoveItem = null;
        }

        function moveItemToCategory(toCategory) {
            if (!currentMoveItem) return;
            
            const { fromCategory, itemId } = currentMoveItem;
            const itemIndex = groceryList[fromCategory].findIndex(item => item.id === itemId);
            
            if (itemIndex !== -1) {
                const [item] = groceryList[fromCategory].splice(itemIndex, 1);
                
                if (!groceryList[toCategory]) {
                    groceryList[toCategory] = [];
                }
                groceryList[toCategory].push(item);
                
                if (groceryList[fromCategory].length === 0) {
                    delete groceryList[fromCategory];
                }
                
                saveToLocalStorage();
                renderCategories();
            }
            
            closeMoveModal();
        }

        // Rename item modal functions
        let currentRenameItem = null;

        function openRenameModal(category, itemId) {
            currentRenameItem = { category, itemId };
            const item = groceryList[category].find(i => i.id === itemId);
            
            if (item) {
                const modal = document.getElementById('renameModal');
                const input = document.getElementById('renameInput');
                input.value = item.name;
                modal.classList.add('show');
                
                // Focus and select text
                setTimeout(() => {
                    input.focus();
                    input.select();
                }, 100);
            }
        }

        function closeRenameModal() {
            const modal = document.getElementById('renameModal');
            modal.classList.remove('show');
            currentRenameItem = null;
            currentRenameMeal = null;
        }

        function confirmRename() {
            // Check if we're renaming a meal or an item
            if (currentRenameMeal !== null) {
                confirmRenameMeal();
                return;
            }
            
            if (!currentRenameItem) return;
            
            const { category, itemId } = currentRenameItem;
            const newName = document.getElementById('renameInput').value.trim();
            
            if (newName) {
                const item = groceryList[category].find(i => i.id === itemId);
                if (item) {
                    item.name = newName;
                    saveToLocalStorage();
                    renderCategories();
                }
            }
            
            closeRenameModal();
        }

        // Quantity modal functions
        let currentQuantityItem = null;

        function openQuantityModal(category, itemId) {
            currentQuantityItem = { category, itemId };
            const item = groceryList[category].find(i => i.id === itemId);
            
            if (item) {
                const modal = document.getElementById('quantityModal');
                const input = document.getElementById('quantityInput');
                const nameDisplay = document.getElementById('quantityItemName');
                
                nameDisplay.textContent = `Quantité pour "${item.name}"`;
                input.value = item.quantity || '';
                modal.classList.add('show');
                
                // Focus input
                setTimeout(() => {
                    input.focus();
                    input.select();
                }, 100);
            }
        }

        function closeQuantityModal() {
            const modal = document.getElementById('quantityModal');
            modal.classList.remove('show');
            currentQuantityItem = null;
        }

        function confirmQuantity() {
            if (!currentQuantityItem) return;
            
            const { category, itemId } = currentQuantityItem;
            const quantity = document.getElementById('quantityInput').value.trim();
            
            const item = groceryList[category].find(i => i.id === itemId);
            if (item) {
                if (quantity) {
                    item.quantity = quantity;
                } else {
                    delete item.quantity;
                }
                saveToLocalStorage();
                renderCategories();
            }
            
            closeQuantityModal();
        }

        function removeQuantity() {
            if (!currentQuantityItem) return;
            
            const { category, itemId } = currentQuantityItem;
            const item = groceryList[category].find(i => i.id === itemId);
            
            if (item) {
                delete item.quantity;
                saveToLocalStorage();
                renderCategories();
            }
            
            closeQuantityModal();
        }

        // Meal management functions
        function renderMealItem(mealId) {
            const meal = meals[mealId];
            const ingredientCount = meal.ingredients.length;
            const ingredientNames = meal.ingredients.map(ing => {
                const items = groceryList[ing.category] || [];
                const item = items.find(i => String(i.id) === String(ing.itemId));
                return item ? escapeHtml(item.name) : '';
            }).filter(Boolean).slice(0, 3).join(', ');
            const moreText = ingredientCount > 3 ? ` +${ingredientCount - 3} autres` : '';

            const hasSections = mealSectionOrder.length > 0;
            const moveToSectionBtn = hasSections ? `
                <button class="item-dropdown-item move" onclick="openMoveMealToSectionModal('${mealId}'); closeAllMealMenus();">
                    📂 Déplacer vers section
                </button>
            ` : '';

            return `
                <div class="meal-item ${meal.selected ? 'selected' : ''}"
                     id="meal-${mealId}"
                     draggable="true"
                     data-meal-id="${mealId}"
                     data-section-id="${meal.sectionId || ''}">
                    <span class="drag-handle" style="cursor: grab; color: #adb5bd; margin-right: 8px;">⋮⋮</span>
                    <input type="checkbox" class="meal-checkbox"
                           ${meal.selected ? 'checked' : ''}
                           onchange="toggleMeal('${mealId}')">
                    <div class="meal-info">
                        <div class="meal-name">${escapeHtml(meal.name)}</div>
                        <div class="meal-ingredients">${ingredientNames}${moreText}</div>
                    </div>
                    <button class="meal-recipe-btn ${meal.recipe ? 'has-recipe' : ''}" onclick="openRecipeModal('${mealId}')" title="${meal.recipe ? 'Voir la recette' : 'Ajouter une recette'}">📖</button>
                    <div class="item-actions">
                        <button class="item-menu-btn" onclick="toggleMealMenu(event, '${mealId}')" title="Actions">
                            ⋮
                        </button>
                        <div class="item-dropdown" id="meal-menu-${mealId}">
                            <button class="item-dropdown-item rename" onclick="openRenameMealModal('${mealId}'); closeAllMealMenus();">
                                ✏️ Renommer
                            </button>
                            <button class="item-dropdown-item move" onclick="openEditMealModal('${mealId}'); closeAllMealMenus();">
                                🍴 Modifier ingrédients
                            </button>
                            ${moveToSectionBtn}
                            <button class="item-dropdown-item delete" onclick="deleteMeal('${mealId}'); closeAllMealMenus();">
                                🗑️ Supprimer
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }

        function getOrderedMealKeys() {
            const allKeys = Object.keys(meals);
            // Migration: si mealOrder est vide, initialiser avec les clés existantes
            if (mealOrder.length === 0 && allKeys.length > 0) {
                mealOrder = [...allKeys];
            }
            // Filtrer les IDs qui n'existent plus + ajouter les nouveaux à la fin
            const validOrdered = mealOrder.filter(id => meals[id]);
            const missing = allKeys.filter(id => !mealOrder.includes(id));
            if (missing.length > 0) {
                mealOrder = [...validOrdered, ...missing];
            } else {
                mealOrder = validOrdered;
            }
            return [...mealOrder];
        }

        function renderMeals() {
            const container = document.getElementById('mealsList');
            const mealKeys = getOrderedMealKeys();

            // Filter meals by search term
            const filteredMealKeys = mealSearchTerm
                ? mealKeys.filter(id => meals[id] && normalizeSearch(meals[id].name).includes(normalizeSearch(mealSearchTerm)))
                : mealKeys;

            if (mealKeys.length === 0 && mealSectionOrder.length === 0) {
                container.innerHTML = `
                    <div class="meals-empty">
                        Aucun plat créé. Cliquez sur "+ Nouveau plat" pour commencer.
                    </div>
                `;
                return;
            }

            let html = '';

            // 1. Unsectioned meals (no sectionId or section deleted)
            const unsectionedMeals = filteredMealKeys.filter(id => {
                const sectionId = meals[id].sectionId;
                return !sectionId || !mealSections[sectionId];
            });

            if (unsectionedMeals.length > 0) {
                html += '<div class="meal-unsectioned" data-section-id="">';
                if (mealSectionOrder.length > 0) {
                    html += '<div class="meal-unsectioned-label">Sans section</div>';
                }
                html += unsectionedMeals.map(mealId => renderMealItem(mealId)).join('');
                html += '</div>';
            }

            // 2. Each section in order
            const validSectionOrder = mealSectionOrder.filter(id => mealSections[id]);

            validSectionOrder.forEach(sectionId => {
                const section = mealSections[sectionId];
                const sectionMeals = filteredMealKeys.filter(id => meals[id].sectionId === sectionId);
                // Hide section if searching and no meals match
                if (mealSearchTerm && sectionMeals.length === 0) return;
                // When searching: expand sections with results
                const isCollapsed = mealSearchTerm ? false : (collapsedMealSections[sectionId] || false);

                html += `
                    <div class="meal-section" data-section-id="${sectionId}" draggable="true">
                        <div class="meal-section-header ${isCollapsed ? 'collapsed' : ''}"
                             data-section-id="${sectionId}"
                             onclick="toggleMealSection('${sectionId}')">
                            <span class="drag-handle" style="cursor: grab; color: #adb5bd;"
                                  onmousedown="event.stopPropagation()">⋮⋮</span>
                            <span class="meal-section-title">${escapeHtml(section.icon || '📁')} ${escapeHtml(section.name)}</span>
                            <span class="meal-section-count">${sectionMeals.length}</span>
                            <span class="category-chevron ${isCollapsed ? 'collapsed' : ''}" style="font-size: 14px; transition: transform 0.3s;">▼</span>
                            <div class="meal-section-actions" onclick="event.stopPropagation()">
                                <button class="item-menu-btn" onclick="toggleSectionMenu(event, '${sectionId}')" title="Actions">
                                    ⋮
                                </button>
                                <div class="item-dropdown" id="section-menu-${sectionId}">
                                    <button class="item-dropdown-item rename" onclick="openRenameSectionModal('${sectionId}'); closeAllMealMenus();">
                                        ✏️ Renommer
                                    </button>
                                    <button class="item-dropdown-item delete" onclick="deleteMealSection('${sectionId}'); closeAllMealMenus();">
                                        🗑️ Supprimer la section
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div class="meal-section-items ${isCollapsed ? 'collapsed' : ''}" data-section-id="${sectionId}">
                            ${sectionMeals.length > 0
                                ? sectionMeals.map(mealId => renderMealItem(mealId)).join('')
                                : '<div class="meals-empty" style="padding: 15px; font-size: 13px;">Aucun plat dans cette section</div>'
                            }
                        </div>
                    </div>
                `;
            });

            // Show "no results" message when searching
            if (mealSearchTerm && filteredMealKeys.length === 0) {
                html += '<div class="meals-empty">Aucun plat trouvé pour "' + escapeHtml(mealSearchTerm) + '"</div>';
            }

            container.innerHTML = html;

            // Apply collapsed state for overall meals section
            updateMealsCollapseState();

            // Initialize drag and drop for meals
            initializeMealsDragAndDrop();
        }

        function toggleMealsSection() {
            mealsCollapsed = !mealsCollapsed;
            saveCollapseState();
            updateMealsCollapseState();
        }

        function updateMealsCollapseState() {
            const mealsList = document.getElementById('mealsList');
            const chevron = document.getElementById('mealsChevron');
            const mealsControls = document.getElementById('mealsControls');

            if (mealsCollapsed) {
                mealsList.classList.add('collapsed');
                if (chevron) chevron.classList.add('collapsed');
                if (mealsControls) mealsControls.classList.add('collapsed');
            } else {
                mealsList.classList.remove('collapsed');
                if (chevron) chevron.classList.remove('collapsed');
                if (mealsControls) mealsControls.classList.remove('collapsed');
            }
        }

        function toggleAllMealSections() {
            const btn = document.getElementById('mealsCollapseAllBtn');
            const allCollapsed = mealSectionOrder.length > 0 && mealSectionOrder.every(id => collapsedMealSections[id]);

            mealSectionOrder.forEach(sectionId => {
                collapsedMealSections[sectionId] = !allCollapsed;
            });

            if (!allCollapsed) {
                btn.classList.add('collapsed');
                btn.title = 'Déplier tout';
            } else {
                btn.classList.remove('collapsed');
                btn.title = 'Replier tout';
            }

            saveCollapseState();
            renderMeals();
        }

        // ========================================
        // MEAL SECTIONS CRUD
        // ========================================
        let currentRenameSectionId = null;
        let currentMoveMealToSectionId = null;

        function selectSectionEmoji(emoji, btn) {
            document.getElementById('sectionEmojiValue').value = emoji;
            document.querySelectorAll('#sectionEmojiPicker .emoji-option').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        }

        function openCreateSectionModal() {
            const modal = document.getElementById('mealSectionModal');
            const header = document.getElementById('mealSectionModalHeader');
            const input = document.getElementById('mealSectionNameInput');
            const confirmBtn = document.getElementById('mealSectionConfirmBtn');

            header.textContent = 'Nouvelle section';
            confirmBtn.textContent = 'Créer';
            confirmBtn.onclick = confirmCreateSection;
            input.value = '';
            currentRenameSectionId = null;

            // Reset emoji picker to default 📁
            document.getElementById('sectionEmojiValue').value = '📁';
            document.querySelectorAll('#sectionEmojiPicker .emoji-option').forEach(b => b.classList.remove('selected'));
            const defaultBtn = document.querySelector('#sectionEmojiPicker .emoji-option');
            if (defaultBtn) defaultBtn.classList.add('selected');

            modal.classList.add('show');
            setTimeout(() => input.focus(), 100);
        }

        function closeMealSectionModal() {
            document.getElementById('mealSectionModal').classList.remove('show');
            currentRenameSectionId = null;
        }

        function confirmMealSection() {
            if (currentRenameSectionId !== null) {
                confirmRenameSection();
            } else {
                confirmCreateSection();
            }
        }

        function confirmCreateSection() {
            const name = document.getElementById('mealSectionNameInput').value.trim();
            if (!name) {
                alert('Veuillez entrer un nom pour la section');
                return;
            }
            const icon = document.getElementById('sectionEmojiValue').value || '📁';
            const sectionId = String(Date.now());
            mealSections[sectionId] = { name: name, icon: icon };
            mealSectionOrder.push(sectionId);
            closeMealSectionModal();
            saveToLocalStorage();
            renderMeals();
        }

        function openRenameSectionModal(sectionId) {
            currentRenameSectionId = sectionId;
            const section = mealSections[sectionId];
            if (!section) return;

            const modal = document.getElementById('mealSectionModal');
            const header = document.getElementById('mealSectionModalHeader');
            const input = document.getElementById('mealSectionNameInput');
            const confirmBtn = document.getElementById('mealSectionConfirmBtn');

            header.textContent = 'Renommer la section';
            confirmBtn.textContent = 'Renommer';
            confirmBtn.onclick = confirmRenameSection;
            input.value = section.name;

            // Pre-select current emoji
            const currentIcon = section.icon || '📁';
            document.getElementById('sectionEmojiValue').value = currentIcon;
            document.querySelectorAll('#sectionEmojiPicker .emoji-option').forEach(b => {
                b.classList.toggle('selected', b.textContent.trim() === currentIcon);
            });

            modal.classList.add('show');
            setTimeout(() => { input.focus(); input.select(); }, 100);
        }

        function confirmRenameSection() {
            if (currentRenameSectionId === null) return;
            const newName = document.getElementById('mealSectionNameInput').value.trim();
            if (newName && mealSections[currentRenameSectionId]) {
                const icon = document.getElementById('sectionEmojiValue').value || '📁';
                mealSections[currentRenameSectionId].name = newName;
                mealSections[currentRenameSectionId].icon = icon;
                saveToLocalStorage();
                renderMeals();
            }
            closeMealSectionModal();
        }

        function deleteMealSection(sectionId) {
            const section = mealSections[sectionId];
            if (!section) return;

            const mealsInSection = Object.keys(meals).filter(id => meals[id].sectionId === sectionId);
            const message = mealsInSection.length > 0
                ? `Supprimer la section "${section.name}" ?\n\nLes ${mealsInSection.length} plat(s) qu'elle contient seront déplacés hors de toute section.`
                : `Supprimer la section "${section.name}" ?`;

            if (confirm(message)) {
                mealsInSection.forEach(mealId => {
                    delete meals[mealId].sectionId;
                });
                delete mealSections[sectionId];
                mealSectionOrder = mealSectionOrder.filter(id => id !== sectionId);
                delete collapsedMealSections[sectionId];
                saveCollapseState();
                saveToLocalStorage();
                renderMeals();
            }
        }

        function toggleMealSection(sectionId) {
            collapsedMealSections[sectionId] = !collapsedMealSections[sectionId];
            saveCollapseState();

            const header = document.querySelector(`.meal-section-header[data-section-id="${sectionId}"]`);
            if (header) {
                const itemsList = header.nextElementSibling;
                const chevron = header.querySelector('.category-chevron');
                if (collapsedMealSections[sectionId]) {
                    header.classList.add('collapsed');
                    if (itemsList) itemsList.classList.add('collapsed');
                    if (chevron) chevron.classList.add('collapsed');
                } else {
                    header.classList.remove('collapsed');
                    if (itemsList) itemsList.classList.remove('collapsed');
                    if (chevron) chevron.classList.remove('collapsed');
                }
            }
        }

        function toggleSectionMenu(event, sectionId) {
            event.stopPropagation();
            const menuId = `section-menu-${sectionId}`;
            const menu = document.getElementById(menuId);
            const button = event.target;

            document.querySelectorAll('.item-dropdown').forEach(dropdown => {
                if (dropdown.id !== menuId) {
                    dropdown.classList.remove('show');
                    dropdown.classList.remove('open-upward');
                }
            });
            document.querySelectorAll('.item-menu-btn').forEach(btn => {
                if (btn !== button) btn.classList.remove('active');
            });

            menu.classList.toggle('show');
            button.classList.toggle('active');

            if (menu.classList.contains('show')) {
                setTimeout(() => {
                    const rect = menu.getBoundingClientRect();
                    if (rect.bottom > window.innerHeight - 20) {
                        menu.classList.add('open-upward');
                    } else {
                        menu.classList.remove('open-upward');
                    }
                }, 10);
            }
        }

        // ========================================
        // MOVE MEAL TO SECTION
        // ========================================
        function openMoveMealToSectionModal(mealId) {
            currentMoveMealToSectionId = mealId;
            const modal = document.getElementById('moveMealSectionModal');
            const container = document.getElementById('mealSectionPickerList');
            const currentSectionId = meals[mealId]?.sectionId || null;

            container.innerHTML = '';

            // "No section" option
            if (currentSectionId) {
                const btn = document.createElement('button');
                btn.className = 'modal-category-btn';
                btn.innerHTML = '📋 Aucune section';
                btn.onclick = () => moveMealToSection(null);
                container.appendChild(btn);
            }

            // Each section (excluding current)
            mealSectionOrder.forEach(sectionId => {
                if (sectionId !== currentSectionId && mealSections[sectionId]) {
                    const btn = document.createElement('button');
                    btn.className = 'modal-category-btn';
                    btn.innerHTML = `${escapeHtml(mealSections[sectionId].icon || '📁')} ${escapeHtml(mealSections[sectionId].name)}`;
                    btn.onclick = () => moveMealToSection(sectionId);
                    container.appendChild(btn);
                }
            });

            if (container.children.length === 0) {
                container.innerHTML = '<div style="padding: 15px; color: #999; text-align: center;">Aucune autre section disponible</div>';
            }

            modal.classList.add('show');
        }

        function closeMoveMealSectionModal() {
            document.getElementById('moveMealSectionModal').classList.remove('show');
            currentMoveMealToSectionId = null;
        }

        function moveMealToSection(sectionId) {
            if (currentMoveMealToSectionId === null) return;
            const meal = meals[currentMoveMealToSectionId];
            if (meal) {
                if (sectionId) {
                    meal.sectionId = sectionId;
                } else {
                    delete meal.sectionId;
                }
                saveToLocalStorage();
                renderMeals();
            }
            closeMoveMealSectionModal();
        }

        // ========================================
        // ARTICLE SECTIONS CRUD
        // ========================================
        let currentRenameArticleSectionId = null;

        function selectArticleSectionEmoji(emoji, btn) {
            document.getElementById('articleSectionEmojiValue').value = emoji;
            document.querySelectorAll('#articleSectionEmojiPicker .emoji-option').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        }

        function openCreateArticleSectionModal() {
            const modal = document.getElementById('articleSectionModal');
            const header = document.getElementById('articleSectionModalHeader');
            const input = document.getElementById('articleSectionNameInput');
            const confirmBtn = document.getElementById('articleSectionConfirmBtn');

            header.textContent = 'Nouvelle section';
            confirmBtn.textContent = 'Créer';
            confirmBtn.onclick = confirmCreateArticleSection;
            input.value = '';
            currentRenameArticleSectionId = null;

            document.getElementById('articleSectionEmojiValue').value = '📁';
            document.querySelectorAll('#articleSectionEmojiPicker .emoji-option').forEach(b => b.classList.remove('selected'));
            const defaultBtn = document.querySelector('#articleSectionEmojiPicker .emoji-option');
            if (defaultBtn) defaultBtn.classList.add('selected');

            modal.classList.add('show');
            setTimeout(() => input.focus(), 100);
        }

        function closeArticleSectionModal() {
            document.getElementById('articleSectionModal').classList.remove('show');
            currentRenameArticleSectionId = null;
        }

        function confirmCreateArticleSection() {
            const name = document.getElementById('articleSectionNameInput').value.trim();
            if (!name) {
                alert('Veuillez entrer un nom pour la section');
                return;
            }
            const icon = document.getElementById('articleSectionEmojiValue').value || '📁';
            const sectionId = String(Date.now());
            articleSections[sectionId] = { name: name, icon: icon };
            articleSectionOrder.push(sectionId);
            groceryList[sectionId] = [];
            closeArticleSectionModal();
            saveToLocalStorage();
            renderCategories();
        }

        function openRenameArticleSectionModal(sectionId) {
            currentRenameArticleSectionId = sectionId;
            const section = articleSections[sectionId];
            if (!section) return;

            const modal = document.getElementById('articleSectionModal');
            const header = document.getElementById('articleSectionModalHeader');
            const input = document.getElementById('articleSectionNameInput');
            const confirmBtn = document.getElementById('articleSectionConfirmBtn');

            header.textContent = 'Renommer la section';
            confirmBtn.textContent = 'Renommer';
            confirmBtn.onclick = confirmRenameArticleSection;
            input.value = section.name;

            const currentIcon = section.icon || '📁';
            document.getElementById('articleSectionEmojiValue').value = currentIcon;
            document.querySelectorAll('#articleSectionEmojiPicker .emoji-option').forEach(b => {
                b.classList.toggle('selected', b.textContent.trim() === currentIcon);
            });

            modal.classList.add('show');
            setTimeout(() => { input.focus(); input.select(); }, 100);
        }

        function confirmRenameArticleSection() {
            if (currentRenameArticleSectionId === null) return;
            const newName = document.getElementById('articleSectionNameInput').value.trim();
            if (newName && articleSections[currentRenameArticleSectionId]) {
                const icon = document.getElementById('articleSectionEmojiValue').value || '📁';
                articleSections[currentRenameArticleSectionId].name = newName;
                articleSections[currentRenameArticleSectionId].icon = icon;
                saveToLocalStorage();
                renderCategories();
            }
            closeArticleSectionModal();
        }

        function deleteArticleSection(sectionId) {
            const section = articleSections[sectionId];
            if (!section) return;

            const items = groceryList[sectionId] || [];
            const message = items.length > 0
                ? `Supprimer la section "${section.name}" ?\n\n${items.length} article(s) seront aussi supprimés.`
                : `Supprimer la section "${section.name}" ?`;

            if (confirm(message)) {
                delete groceryList[sectionId];
                delete articleSections[sectionId];
                articleSectionOrder = articleSectionOrder.filter(id => id !== sectionId);
                delete collapsedCategories[sectionId];
                saveCollapseState();
                saveToLocalStorage();
                renderCategories();
            }
        }

        function toggleArticleSection(sectionKey) {
            collapsedCategories[sectionKey] = !collapsedCategories[sectionKey];
            saveCollapseState();

            const header = document.querySelector(`.category-header[data-section-id="${sectionKey}"]`);
            if (header) {
                const itemsList = header.nextElementSibling;
                const chevron = header.querySelector('.category-chevron');
                if (collapsedCategories[sectionKey]) {
                    header.classList.add('collapsed');
                    if (itemsList) itemsList.classList.add('collapsed');
                    if (chevron) chevron.classList.add('collapsed');
                } else {
                    header.classList.remove('collapsed');
                    if (itemsList) itemsList.classList.remove('collapsed');
                    if (chevron) chevron.classList.remove('collapsed');
                }
            }
        }

        function toggleArticleSectionMenu(event, sectionId) {
            event.stopPropagation();
            const menuId = `article-section-menu-${sectionId}`;
            const menu = document.getElementById(menuId);
            const button = event.target;

            document.querySelectorAll('.item-dropdown').forEach(dropdown => {
                if (dropdown.id !== menuId) {
                    dropdown.classList.remove('show');
                    dropdown.classList.remove('open-upward');
                }
            });
            document.querySelectorAll('.item-menu-btn').forEach(btn => {
                if (btn !== button) btn.classList.remove('active');
            });

            menu.classList.toggle('show');
            button.classList.toggle('active');

            if (menu.classList.contains('show')) {
                setTimeout(() => {
                    const rect = menu.getBoundingClientRect();
                    if (rect.bottom > window.innerHeight - 20) {
                        menu.classList.add('open-upward');
                    } else {
                        menu.classList.remove('open-upward');
                    }
                }, 10);
            }
        }

        let draggedArticleSection = null;

        function initializeArticleSectionDragAndDrop() {
            const sectionElements = document.querySelectorAll('[data-article-section-id][draggable="true"]');
            sectionElements.forEach(section => {
                section.addEventListener('dragstart', handleArticleSectionDragStart);
                section.addEventListener('dragend', handleArticleSectionDragEnd);
                section.addEventListener('dragover', handleArticleSectionDragOver);
                section.addEventListener('drop', handleArticleSectionDrop);
                section.addEventListener('dragleave', handleArticleSectionDragLeave);
            });
        }

        function handleArticleSectionDragStart(e) {
            if (draggedItem) return;
            const handle = e.target.closest('.drag-handle');
            const section = e.target.closest('[data-article-section-id]');
            if (!handle || !section) {
                e.preventDefault();
                return;
            }
            draggedArticleSection = section;
            section.classList.add('dragging-section');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', 'article-section');
        }

        function handleArticleSectionDragEnd(e) {
            if (draggedArticleSection) {
                draggedArticleSection.classList.remove('dragging-section');
                draggedArticleSection = null;
            }
            document.querySelectorAll('[data-article-section-id]').forEach(s => {
                s.classList.remove('drag-over-section');
            });
        }

        function handleArticleSectionDragOver(e) {
            if (!draggedArticleSection) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const section = e.target.closest('[data-article-section-id]');
            if (section && section !== draggedArticleSection) {
                section.classList.add('drag-over-section');
            }
        }

        function handleArticleSectionDragLeave(e) {
            if (!draggedArticleSection) return;
            const section = e.target.closest('[data-article-section-id]');
            if (section) section.classList.remove('drag-over-section');
        }

        function handleArticleSectionDrop(e) {
            if (!draggedArticleSection) return;
            e.stopPropagation();
            const targetSection = e.target.closest('[data-article-section-id]');
            if (targetSection && draggedArticleSection !== targetSection) {
                const draggedId = draggedArticleSection.dataset.articleSectionId;
                const targetId = targetSection.dataset.articleSectionId;

                const draggedIndex = articleSectionOrder.indexOf(draggedId);
                const targetIndex = articleSectionOrder.indexOf(targetId);

                if (draggedIndex > -1 && targetIndex > -1) {
                    articleSectionOrder.splice(draggedIndex, 1);
                    articleSectionOrder.splice(targetIndex, 0, draggedId);
                    saveToLocalStorage();
                    renderCategories();
                }
            }
            return false;
        }

        function toggleArticlesSection() {
            articlesCollapsed = !articlesCollapsed;
            saveCollapseState();
            updateArticlesCollapseState();
        }

        function updateArticlesCollapseState() {
            const articlesContent = document.getElementById('articlesContent');
            const chevron = document.getElementById('articlesChevron');
            
            if (articlesCollapsed) {
                articlesContent.classList.add('collapsed');
                if (chevron) chevron.classList.add('collapsed');
            } else {
                articlesContent.classList.remove('collapsed');
                if (chevron) chevron.classList.remove('collapsed');
            }
        }

        function openMealModal() {
            const modal = document.getElementById('mealModal');
            const selector = document.getElementById('ingredientSelector');
            const header = document.getElementById('mealModalHeader');
            const confirmBtn = document.getElementById('mealConfirmBtn');
            const nameInput = document.getElementById('mealNameInput');
            
            // Set to create mode
            header.textContent = 'Créer un nouveau plat';
            confirmBtn.textContent = 'Créer le plat';
            nameInput.disabled = false;
            
            // Build ingredient selector with all items grouped by section
            let html = '';
            articleSectionOrder.forEach(categoryKey => {
                const items = groceryList[categoryKey] || [];
                if (items.length > 0) {
                    const section = articleSections[categoryKey];
                    if (!section) return;
                    html += `
                        <div class="ingredient-category">
                            <div class="ingredient-category-header">
                                ${section.icon} ${section.name}
                            </div>
                            <div class="ingredient-list">
                                ${items.map(item => {
                                    const value = JSON.stringify({ category: categoryKey, itemId: item.id });
                                    return `
                                        <div class="ingredient-checkbox-item">
                                            <input type="checkbox"
                                                   id="ing-${categoryKey}-${item.id}"
                                                   value="${escapeHtml(value)}">
                                            <label for="ing-${categoryKey}-${item.id}">${escapeHtml(item.name)}</label>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    `;
                }
            });

            selector.innerHTML = html;
            document.getElementById('mealNameInput').value = '';

            // Populate section selector
            const sectionSelect = document.getElementById('mealSectionSelect');
            let sectionHtml = '<option value="">Aucune section</option>';
            mealSectionOrder.forEach(sId => {
                if (mealSections[sId]) {
                    sectionHtml += `<option value="${sId}">${escapeHtml(mealSections[sId].name)}</option>`;
                }
            });
            sectionSelect.innerHTML = sectionHtml;
            sectionSelect.value = '';

            modal.classList.add('show');
        }

        function closeMealModal() {
            const modal = document.getElementById('mealModal');
            const nameInput = document.getElementById('mealNameInput');
            modal.classList.remove('show');
            nameInput.disabled = false;
            currentEditMeal = null;
        }

        function confirmMeal() {
            // Check if we're editing or creating
            if (currentEditMeal !== null) {
                confirmEditMeal();
                return;
            }
            
            const name = document.getElementById('mealNameInput').value.trim();
            if (!name) {
                alert('Veuillez entrer un nom pour le plat');
                return;
            }

            // Get selected ingredients
            const checkboxes = document.querySelectorAll('#ingredientSelector input[type="checkbox"]:checked');
            const ingredients = Array.from(checkboxes).map(cb => {
                try {
                    return JSON.parse(cb.value);
                } catch (e) {
                    console.error('Error parsing ingredient:', cb.value, e);
                    return null;
                }
            }).filter(Boolean);

            if (ingredients.length === 0) {
                alert('Veuillez sélectionner au moins un ingrédient');
                return;
            }

            // Create meal
            const mealId = Date.now();
            const sectionId = document.getElementById('mealSectionSelect').value;
            meals[mealId] = {
                name,
                ingredients,
                selected: false
            };
            if (sectionId) {
                meals[mealId].sectionId = sectionId;
            }
            mealOrder.push(String(mealId));

            saveToLocalStorage();
            renderMeals();
            closeMealModal();
        }

        function toggleMeal(mealId) {
            const meal = meals[mealId];
            meal.selected = !meal.selected;

            console.log('Toggling meal:', meal.name, 'to', meal.selected);
            console.log('Ingredients:', meal.ingredients);

            // Toggle all ingredients in the grocery list
            meal.ingredients.forEach(ing => {
                console.log('Looking for ingredient:', ing);
                const items = groceryList[ing.category] || [];
                console.log('Items in category', ing.category, ':', items.map(i => ({ id: i.id, name: i.name })));
                
                // Try exact match first, then string comparison
                let item = items.find(i => i.id === ing.itemId);
                if (!item) {
                    item = items.find(i => String(i.id) === String(ing.itemId));
                }
                
                if (item) {
                    console.log('Found item:', item.name, 'setting checked to', meal.selected);
                    item.checked = meal.selected;
                } else {
                    console.log('Item not found! Looking for id:', ing.itemId, 'type:', typeof ing.itemId);
                }
            });

            saveToLocalStorage();
            renderMeals();
            renderCategories();
        }

        function deleteMeal(mealId) {
            if (confirm('Voulez-vous vraiment supprimer ce plat ?')) {
                delete meals[mealId];
                mealOrder = mealOrder.filter(id => id !== String(mealId));
                saveToLocalStorage();
                renderMeals();
            }
        }

        // Meal menu functions
        function toggleMealMenu(event, mealId) {
            event.stopPropagation();
            const menuId = `meal-menu-${mealId}`;
            const menu = document.getElementById(menuId);
            const button = event.target;
            
            // Close all other menus
            document.querySelectorAll('.item-dropdown').forEach(dropdown => {
                if (dropdown.id !== menuId) {
                    dropdown.classList.remove('show');
                    dropdown.classList.remove('open-upward');
                }
            });
            
            // Remove active state from all buttons
            document.querySelectorAll('.item-menu-btn').forEach(btn => {
                if (btn !== button) {
                    btn.classList.remove('active');
                }
            });
            
            // Toggle current menu
            menu.classList.toggle('show');
            button.classList.toggle('active');
            
            // Check if menu should open upward
            if (menu.classList.contains('show')) {
                setTimeout(() => {
                    const rect = menu.getBoundingClientRect();
                    const viewportHeight = window.innerHeight;
                    
                    // If menu would be cut off at bottom, open upward
                    if (rect.bottom > viewportHeight - 20) {
                        menu.classList.add('open-upward');
                    } else {
                        menu.classList.remove('open-upward');
                    }
                }, 10);
            }
        }

        function closeAllMealMenus() {
            document.querySelectorAll('.item-dropdown').forEach(dropdown => {
                dropdown.classList.remove('show');
                dropdown.classList.remove('open-upward');
            });
            document.querySelectorAll('.item-menu-btn').forEach(btn => {
                btn.classList.remove('active');
            });
        }

        // Rename meal
        let currentRenameMeal = null;

        function openRenameMealModal(mealId) {
            currentRenameMeal = mealId;
            const meal = meals[mealId];
            
            if (meal) {
                const modal = document.getElementById('renameModal');
                const input = document.getElementById('renameInput');
                input.value = meal.name;
                modal.classList.add('show');
                
                // Focus and select text
                setTimeout(() => {
                    input.focus();
                    input.select();
                }, 100);
            }
        }

        function confirmRenameMeal() {
            if (currentRenameMeal === null) return;
            
            const newName = document.getElementById('renameInput').value.trim();
            
            if (newName) {
                const meal = meals[currentRenameMeal];
                if (meal) {
                    meal.name = newName;
                    saveToLocalStorage();
                    renderMeals();
                }
            }
            
            closeRenameModal();
            currentRenameMeal = null;
        }

        // Recipe modal
        let currentRecipeMealId = null;

        function openRecipeModal(mealId) {
            currentRecipeMealId = mealId;
            const meal = meals[mealId];
            if (!meal) return;

            const modal = document.getElementById('recipeModal');
            const header = document.getElementById('recipeModalHeader');
            header.textContent = '📖 ' + meal.name;

            const hasRecipe = meal.recipe && meal.recipe.trim();

            if (hasRecipe) {
                // Read mode
                document.getElementById('recipeReadContent').textContent = meal.recipe;
                document.getElementById('recipeReadView').style.display = '';
                document.getElementById('recipeEditView').style.display = 'none';
            } else {
                // Edit mode directly
                switchRecipeToEdit();
            }

            modal.classList.add('show');
        }

        function switchRecipeToEdit() {
            const meal = meals[currentRecipeMealId];
            if (!meal) return;

            const textarea = document.getElementById('recipeTextarea');
            textarea.value = meal.recipe || '';

            document.getElementById('recipeReadView').style.display = 'none';
            document.getElementById('recipeEditView').style.display = 'flex';

            setTimeout(() => textarea.focus(), 100);
        }

        function saveRecipe() {
            if (currentRecipeMealId === null) return;
            const meal = meals[currentRecipeMealId];
            if (!meal) return;

            const text = document.getElementById('recipeTextarea').value.trim();
            meal.recipe = text;

            saveToLocalStorage();
            renderMeals();
            closeRecipeModal();
        }

        function closeRecipeModal() {
            document.getElementById('recipeModal').classList.remove('show');
            document.getElementById('recipeEditView').style.display = 'none';
            document.getElementById('recipeReadView').style.display = '';
            currentRecipeMealId = null;
        }

        // Edit meal ingredients
        let currentEditMeal = null;

        function openEditMealModal(mealId) {
            currentEditMeal = mealId;
            const meal = meals[mealId];
            
            if (meal) {
                const modal = document.getElementById('mealModal');
                const selector = document.getElementById('ingredientSelector');
                const nameInput = document.getElementById('mealNameInput');
                const header = document.getElementById('mealModalHeader');
                const confirmBtn = document.getElementById('mealConfirmBtn');
                
                // Set to edit mode
                header.textContent = 'Modifier les ingrédients';
                confirmBtn.textContent = 'Enregistrer';
                nameInput.value = meal.name;
                nameInput.disabled = true;
                
                // Build ingredient selector with current selections checked
                let html = '';
                articleSectionOrder.forEach(categoryKey => {
                    const items = groceryList[categoryKey] || [];
                    if (items.length > 0) {
                        const section = articleSections[categoryKey];
                        if (!section) return;
                        html += `
                            <div class="ingredient-category">
                                <div class="ingredient-category-header">
                                    ${section.icon} ${section.name}
                                </div>
                                <div class="ingredient-list">
                                    ${items.map(item => {
                                        const value = JSON.stringify({ category: categoryKey, itemId: item.id });
                                        const isChecked = meal.ingredients.some(ing =>
                                            ing.category === categoryKey && String(ing.itemId) === String(item.id)
                                        );
                                        return `
                                            <div class="ingredient-checkbox-item">
                                                <input type="checkbox"
                                                       id="ing-${categoryKey}-${item.id}"
                                                       value="${escapeHtml(value)}"
                                                       ${isChecked ? 'checked' : ''}>
                                                <label for="ing-${categoryKey}-${item.id}">${escapeHtml(item.name)}</label>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                        `;
                    }
                });

                selector.innerHTML = html;

                // Populate section selector with current selection
                const sectionSelect = document.getElementById('mealSectionSelect');
                let sectionHtml = '<option value="">Aucune section</option>';
                mealSectionOrder.forEach(sId => {
                    if (mealSections[sId]) {
                        sectionHtml += `<option value="${sId}">${escapeHtml(mealSections[sId].name)}</option>`;
                    }
                });
                sectionSelect.innerHTML = sectionHtml;
                sectionSelect.value = meal.sectionId || '';

                modal.classList.add('show');
            }
        }

        function confirmEditMeal() {
            if (currentEditMeal === null) return;

            // Get selected ingredients
            const checkboxes = document.querySelectorAll('#ingredientSelector input[type="checkbox"]:checked');
            const ingredients = Array.from(checkboxes).map(cb => {
                try {
                    return JSON.parse(cb.value);
                } catch (e) {
                    console.error('Error parsing ingredient:', cb.value, e);
                    return null;
                }
            }).filter(Boolean);

            if (ingredients.length === 0) {
                alert('Veuillez sélectionner au moins un ingrédient');
                return;
            }

            // Update meal
            const meal = meals[currentEditMeal];
            if (meal) {
                meal.ingredients = ingredients;
                // Update section
                const sectionId = document.getElementById('mealSectionSelect').value;
                if (sectionId) {
                    meal.sectionId = sectionId;
                } else {
                    delete meal.sectionId;
                }
                saveToLocalStorage();
                renderMeals();
            }

            closeMealModal();
            currentEditMeal = null;
        }

        // Dropdown menu functions
        function toggleItemMenu(event, category, itemId) {
            event.stopPropagation();
            const menuId = `menu-${category}-${itemId}`;
            const menu = document.getElementById(menuId);
            const button = event.target;
            
            // Close all other menus
            document.querySelectorAll('.item-dropdown').forEach(dropdown => {
                if (dropdown.id !== menuId) {
                    dropdown.classList.remove('show');
                    dropdown.classList.remove('open-upward');
                }
            });
            
            // Remove active state from all buttons
            document.querySelectorAll('.item-menu-btn').forEach(btn => {
                if (btn !== button) {
                    btn.classList.remove('active');
                }
            });
            
            // Toggle current menu
            const isShowing = menu.classList.contains('show');
            menu.classList.toggle('show');
            button.classList.toggle('active');
            
            // Check if menu should open upward
            if (menu.classList.contains('show')) {
                setTimeout(() => {
                    const rect = menu.getBoundingClientRect();
                    const viewportHeight = window.innerHeight;
                    
                    // If menu would be cut off at bottom, open upward
                    if (rect.bottom > viewportHeight - 20) {
                        menu.classList.add('open-upward');
                    } else {
                        menu.classList.remove('open-upward');
                    }
                }, 10);
            }
        }

        function closeAllMenus() {
            document.querySelectorAll('.item-dropdown').forEach(dropdown => {
                dropdown.classList.remove('show');
                dropdown.classList.remove('open-upward');
            });
            document.querySelectorAll('.item-menu-btn').forEach(btn => {
                btn.classList.remove('active');
            });
        }

        function filterItems(items) {
            let filtered = items;

            // Apply status filter
            if (currentFilter === 'checked') {
                // Show items marked to buy
                filtered = filtered.filter(item => item.checked);
            } else if (currentFilter === 'active') {
                // Show items not selected
                filtered = filtered.filter(item => !item.checked);
            }

            // Apply search filter
            if (searchTerm) {
                const normalizedSearch = normalizeSearch(searchTerm);
                filtered = filtered.filter(item =>
                    normalizeSearch(item.name).includes(normalizedSearch)
                );
            }

            return filtered;
        }

        function renderItemsHtml(items, categoryKey) {
            return items.map(item => `
                <div class="item ${item.checked ? 'checked' : ''}"
                     draggable="true"
                     data-item-id="${item.id}"
                     data-category="${categoryKey}">
                    <span class="drag-handle">⋮⋮</span>
                    <input type="checkbox" class="item-checkbox"
                           ${item.checked ? 'checked' : ''}
                           onchange="toggleItem('${categoryKey}', ${item.id})">
                    <span class="item-name">${escapeHtml(item.name)}</span>
                    ${item.quantity ? `<span class="quantity-badge" onclick="event.stopPropagation(); openQuantityModal('${categoryKey}', ${item.id})" title="Modifier la quantité">${item.quantity}</span>` : ''}
                    <div class="item-actions">
                        <button class="item-menu-btn" onclick="toggleItemMenu(event, '${categoryKey}', ${item.id})" title="Actions">
                            ⋮
                        </button>
                        <div class="item-dropdown" id="menu-${categoryKey}-${item.id}">
                            <button class="item-dropdown-item rename" onclick="openRenameModal('${categoryKey}', ${item.id}); closeAllMenus();">
                                ✏️ Renommer
                            </button>
                            <button class="item-dropdown-item quantity" onclick="openQuantityModal('${categoryKey}', ${item.id}); closeAllMenus();">
                                📊 Quantité
                            </button>
                            <button class="item-dropdown-item move" onclick="openMoveModal('${categoryKey}', ${item.id}); closeAllMenus();">
                                📁 Déplacer
                            </button>
                            <button class="item-dropdown-item delete" onclick="deleteItem('${categoryKey}', ${item.id}); closeAllMenus();">
                                🗑️ Supprimer
                            </button>
                        </div>
                    </div>
                </div>
            `).join('');
        }

        function renderCategories() {
            const container = document.getElementById('categoriesContainer');
            container.innerHTML = '';

            let hasVisibleItems = false;
            const isSearching = !!searchTerm;

            // Unsectioned items: keys in groceryList not in articleSections
            const unsectionedKeys = Object.keys(groceryList).filter(key => !articleSections[key]);
            unsectionedKeys.forEach(key => {
                const filteredItems = filterItems(groceryList[key] || []);
                if (filteredItems.length > 0) {
                    hasVisibleItems = true;
                    const div = document.createElement('div');
                    div.className = 'category';
                    const isCollapsed = isSearching ? false : (collapsedCategories[key] || false);
                    div.innerHTML = `
                        <div class="category-header ${isCollapsed ? 'collapsed' : ''}" data-section-id="${key}" onclick="toggleArticleSection('${key}')">
                            <span class="category-icon">📦</span>
                            <span class="category-title">${escapeHtml(key)}</span>
                            <span class="category-count">${filteredItems.length}</span>
                            <span class="category-chevron ${isCollapsed ? 'collapsed' : ''}">▼</span>
                        </div>
                        <div class="items-list ${isCollapsed ? 'collapsed' : ''}" data-category="${key}">
                            ${renderItemsHtml(filteredItems, key)}
                        </div>
                    `;
                    container.appendChild(div);
                }
            });

            // Sectioned items: iterate articleSectionOrder
            articleSectionOrder.forEach(sectionKey => {
                const section = articleSections[sectionKey];
                if (!section) return;

                const items = groceryList[sectionKey] || [];
                const filteredItems = filterItems(items);
                const hasResults = filteredItems.length > 0;

                if (hasResults || (!isSearching && currentFilter === 'all')) {
                    if (hasResults) hasVisibleItems = true;
                    const categoryDiv = document.createElement('div');
                    categoryDiv.className = 'category';
                    categoryDiv.setAttribute('data-article-section-id', sectionKey);
                    categoryDiv.setAttribute('draggable', 'true');

                    // When searching: expand sections with results, collapse those without
                    const isCollapsed = isSearching ? !hasResults : (collapsedCategories[sectionKey] || false);

                    categoryDiv.innerHTML = `
                        <div class="category-header ${isCollapsed ? 'collapsed' : ''}" data-section-id="${sectionKey}" onclick="toggleArticleSection('${sectionKey}')">
                            <span class="drag-handle" style="cursor: grab; color: #adb5bd;" onmousedown="event.stopPropagation()">⋮⋮</span>
                            <span class="category-icon">${escapeHtml(section.icon || '📁')}</span>
                            <span class="category-title">${escapeHtml(section.name)}</span>
                            <span class="category-count">${filteredItems.length}</span>
                            <span class="category-chevron ${isCollapsed ? 'collapsed' : ''}">▼</span>
                            <div class="meal-section-actions" onclick="event.stopPropagation()">
                                <button class="item-menu-btn" onclick="toggleArticleSectionMenu(event, '${sectionKey}')" title="Actions">
                                    ⋮
                                </button>
                                <div class="item-dropdown" id="article-section-menu-${sectionKey}">
                                    <button class="item-dropdown-item rename" onclick="openRenameArticleSectionModal('${sectionKey}'); closeAllMenus();">
                                        ✏️ Renommer
                                    </button>
                                    <button class="item-dropdown-item delete" onclick="deleteArticleSection('${sectionKey}'); closeAllMenus();">
                                        🗑️ Supprimer la section
                                    </button>
                                </div>
                            </div>
                        </div>
                        <div class="items-list ${isCollapsed ? 'collapsed' : ''}" data-category="${sectionKey}">
                            ${filteredItems.length > 0
                                ? renderItemsHtml(filteredItems, sectionKey)
                                : '<div class="meals-empty" style="padding: 15px; font-size: 13px; color: #999;">Aucun article dans cette section</div>'
                            }
                        </div>
                    `;

                    container.appendChild(categoryDiv);
                }
            });

            if (!hasVisibleItems) {
                if (isSearching) {
                    container.innerHTML = `
                        <div class="meals-empty">
                            Aucun article trouvé pour "${escapeHtml(searchTerm)}"
                            <button onclick="openAddArticleModal('${escapeHtml(searchTerm).replace(/'/g, "\\'")}')" style="display:block; margin:12px auto 0; padding:10px 20px; background:linear-gradient(135deg,#667eea 0%,#764ba2 100%); color:white; border:none; border-radius:8px; font-size:14px; cursor:pointer;">
                                + Créer "${escapeHtml(searchTerm)}"
                            </button>
                        </div>
                    `;
                } else {
                    container.innerHTML = `
                        <div class="empty-state">
                            <div class="empty-state-icon">🛒</div>
                            <p>Aucun article dans votre liste</p>
                        </div>
                    `;
                }
            }

            updateStats();
            initializeDragAndDrop();
            initializeArticleSectionDragAndDrop();
            updateCollapseAllButton();
        }

        function updateCollapseAllButton() {
            const btn = document.getElementById('collapseAllBtn');
            if (!btn) return;
            
            const visibleCategories = articleSectionOrder.filter(key => {
                const items = groceryList[key] || [];
                return filterItems(items).length > 0;
            });
            
            const allCollapsed = visibleCategories.every(key => collapsedCategories[key]);
            
            if (allCollapsed) {
                btn.classList.add('collapsed');
            } else {
                btn.classList.remove('collapsed');
            }
        }

        function updateStats() {
            let total = 0;
            let checked = 0;

            Object.values(groceryList).forEach(items => {
                total += items.length;
                checked += items.filter(item => item.checked).length;
            });

            document.getElementById('totalItems').textContent = total;
            document.getElementById('checkedItems').textContent = checked;
            document.getElementById('remainingItems').textContent = total - checked;
        }

        // Drag and Drop functionality
        let draggedItem = null;

        function initializeDragAndDrop() {
            const items = document.querySelectorAll('.item[draggable="true"]');
            
            items.forEach(item => {
                item.addEventListener('dragstart', handleDragStart);
                item.addEventListener('dragend', handleDragEnd);
                item.addEventListener('dragover', handleDragOver);
                item.addEventListener('drop', handleDrop);
                item.addEventListener('dragleave', handleDragLeave);
            });
        }

        function handleDragStart(e) {
            draggedItem = e.target;
            e.target.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', e.target.innerHTML);
        }

        function handleDragEnd(e) {
            e.target.classList.remove('dragging');
            document.querySelectorAll('.item').forEach(item => {
                item.classList.remove('drag-over');
            });
        }

        function handleDragOver(e) {
            if (e.preventDefault) {
                e.preventDefault();
            }
            e.dataTransfer.dropEffect = 'move';
            
            if (e.target.classList.contains('item')) {
                e.target.classList.add('drag-over');
            }
            
            return false;
        }

        function handleDragLeave(e) {
            if (e.target.classList.contains('item')) {
                e.target.classList.remove('drag-over');
            }
        }

        function handleDrop(e) {
            if (e.stopPropagation) {
                e.stopPropagation();
            }

            const target = e.target.closest('.item');
            if (draggedItem && target && draggedItem !== target) {
                const draggedCategory = draggedItem.dataset.category;
                const draggedItemId = parseInt(draggedItem.dataset.itemId);
                const targetCategory = target.dataset.category;
                const targetItemId = parseInt(target.dataset.itemId);

                // Find items
                const draggedItemIndex = groceryList[draggedCategory].findIndex(item => item.id === draggedItemId);
                const targetItemIndex = groceryList[targetCategory].findIndex(item => item.id === targetItemId);

                if (draggedCategory === targetCategory) {
                    // Reorder within same category
                    const [removed] = groceryList[draggedCategory].splice(draggedItemIndex, 1);
                    groceryList[draggedCategory].splice(targetItemIndex, 0, removed);
                } else {
                    // Move to different category
                    const [removed] = groceryList[draggedCategory].splice(draggedItemIndex, 1);
                    groceryList[targetCategory].splice(targetItemIndex, 0, removed);
                }

                saveToLocalStorage();
                renderCategories();
            }

            return false;
        }

        // Drag and drop for meals (with section support)
        let draggedMeal = null;
        let draggedSection = null;

        function initializeMealsDragAndDrop() {
            // Meal items drag & drop
            const mealItems = document.querySelectorAll('.meal-item[draggable="true"]');
            mealItems.forEach(item => {
                item.addEventListener('dragstart', handleMealDragStart);
                item.addEventListener('dragend', handleMealDragEnd);
                item.addEventListener('dragover', handleMealDragOver);
                item.addEventListener('drop', handleMealDrop);
                item.addEventListener('dragleave', handleMealDragLeave);
            });

            // Section containers as drop targets
            const sectionContainers = document.querySelectorAll('.meal-section-items');
            sectionContainers.forEach(container => {
                container.addEventListener('dragover', function(e) {
                    if (!draggedMeal || draggedSection) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    const section = this.closest('.meal-section');
                    if (section) section.classList.add('drag-over-section');
                });
                container.addEventListener('drop', function(e) {
                    if (!draggedMeal || draggedSection) return;
                    e.stopPropagation();
                    const targetSectionId = this.dataset.sectionId;
                    const draggedMealId = draggedMeal.dataset.mealId;
                    if (targetSectionId) {
                        meals[draggedMealId].sectionId = targetSectionId;
                    } else {
                        delete meals[draggedMealId].sectionId;
                    }
                    saveToLocalStorage();
                    renderMeals();
                });
                container.addEventListener('dragleave', function(e) {
                    const section = this.closest('.meal-section');
                    if (section) section.classList.remove('drag-over-section');
                });
            });

            // Section drag & drop (reorder sections)
            const sectionElements = document.querySelectorAll('.meal-section[draggable="true"]');
            sectionElements.forEach(section => {
                section.addEventListener('dragstart', handleSectionDragStart);
                section.addEventListener('dragend', handleSectionDragEnd);
                section.addEventListener('dragover', handleSectionDragOver);
                section.addEventListener('drop', handleSectionDrop);
                section.addEventListener('dragleave', handleSectionDragLeave);
            });
        }

        function handleMealDragStart(e) {
            const mealItem = e.target.closest('.meal-item');
            if (!mealItem) return;
            draggedMeal = mealItem;
            draggedSection = null;
            mealItem.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', 'meal');
            e.stopPropagation();
        }

        function handleMealDragEnd(e) {
            if (draggedMeal) {
                draggedMeal.classList.remove('dragging');
                draggedMeal = null;
            }
            document.querySelectorAll('.meal-item').forEach(item => {
                item.classList.remove('drag-over');
            });
            document.querySelectorAll('.meal-section').forEach(s => {
                s.classList.remove('drag-over-section');
            });
        }

        function handleMealDragOver(e) {
            if (!draggedMeal || draggedSection) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';

            const mealItem = e.target.closest('.meal-item');
            if (mealItem && mealItem !== draggedMeal) {
                mealItem.classList.add('drag-over');
            }
            return false;
        }

        function handleMealDragLeave(e) {
            const mealItem = e.target.closest('.meal-item');
            if (mealItem) {
                mealItem.classList.remove('drag-over');
            }
        }

        function handleMealDrop(e) {
            if (!draggedMeal || draggedSection) return;
            e.stopPropagation();

            const target = e.target.closest('.meal-item');
            if (draggedMeal && target && draggedMeal !== target) {
                const draggedMealId = draggedMeal.dataset.mealId;
                const targetMealId = target.dataset.mealId;
                const targetSectionId = target.dataset.sectionId || null;

                // Move meal to target's section
                if (targetSectionId) {
                    meals[draggedMealId].sectionId = targetSectionId;
                } else {
                    delete meals[draggedMealId].sectionId;
                }

                // Reorder within mealOrder
                const orderedKeys = getOrderedMealKeys();
                const draggedIndex = orderedKeys.indexOf(draggedMealId);
                const targetIndex = orderedKeys.indexOf(targetMealId);

                if (draggedIndex > -1 && targetIndex > -1) {
                    const [removed] = orderedKeys.splice(draggedIndex, 1);
                    orderedKeys.splice(targetIndex, 0, removed);
                    mealOrder = orderedKeys;
                }

                saveToLocalStorage();
                renderMeals();
            }
            return false;
        }

        // Section reorder drag & drop
        function handleSectionDragStart(e) {
            if (draggedMeal) return; // A meal is being dragged, not a section
            const handle = e.target.closest('.drag-handle');
            const section = e.target.closest('.meal-section');
            if (!handle || !section) {
                e.preventDefault();
                return;
            }
            draggedSection = section;
            draggedMeal = null;
            section.classList.add('dragging-section');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', 'section');
        }

        function handleSectionDragEnd(e) {
            if (draggedSection) {
                draggedSection.classList.remove('dragging-section');
                draggedSection = null;
            }
            document.querySelectorAll('.meal-section').forEach(s => {
                s.classList.remove('drag-over-section');
            });
        }

        function handleSectionDragOver(e) {
            if (!draggedSection) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            const section = e.target.closest('.meal-section');
            if (section && section !== draggedSection) {
                section.classList.add('drag-over-section');
            }
        }

        function handleSectionDragLeave(e) {
            if (!draggedSection) return;
            const section = e.target.closest('.meal-section');
            if (section) section.classList.remove('drag-over-section');
        }

        function handleSectionDrop(e) {
            if (!draggedSection) return;
            e.stopPropagation();
            const targetSection = e.target.closest('.meal-section');
            if (targetSection && draggedSection !== targetSection) {
                const draggedId = draggedSection.dataset.sectionId;
                const targetId = targetSection.dataset.sectionId;

                const draggedIndex = mealSectionOrder.indexOf(draggedId);
                const targetIndex = mealSectionOrder.indexOf(targetId);

                if (draggedIndex > -1 && targetIndex > -1) {
                    mealSectionOrder.splice(draggedIndex, 1);
                    mealSectionOrder.splice(targetIndex, 0, draggedId);
                    saveToLocalStorage();
                    renderMeals();
                }
            }
            return false;
        }

        // Event Listeners
        document.getElementById('searchBox').addEventListener('input', (e) => {
            searchTerm = e.target.value;
            document.getElementById('searchClearBtn').style.display = searchTerm ? 'block' : 'none';
            renderCategories();
        });

        document.getElementById('searchClearBtn').addEventListener('click', () => {
            const box = document.getElementById('searchBox');
            box.value = '';
            searchTerm = '';
            document.getElementById('searchClearBtn').style.display = 'none';
            renderCategories();
            box.focus();
        });

        document.getElementById('mealsSearchBox').addEventListener('input', (e) => {
            mealSearchTerm = e.target.value;
            document.getElementById('mealsSearchClearBtn').style.display = mealSearchTerm ? 'block' : 'none';
            renderMeals();
        });

        document.getElementById('mealsSearchClearBtn').addEventListener('click', () => {
            const box = document.getElementById('mealsSearchBox');
            box.value = '';
            mealSearchTerm = '';
            document.getElementById('mealsSearchClearBtn').style.display = 'none';
            renderMeals();
            box.focus();
        });

        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                currentFilter = e.target.dataset.filter;
                
                // Si on clique sur "À acheter", on déplie toutes les catégories
                if (currentFilter === 'checked') {
                    // Déplier toutes les catégories
                    articleSectionOrder.forEach(categoryKey => {
                        collapsedCategories[categoryKey] = false;
                    });
                    saveToLocalStorage();
                }
                
                renderCategories();
            });
        });

        // ========================================
        // MIGRATION — Données localStorage → nouveau UID Firebase
        // ========================================
        async function migrateLocalDataIfNeeded() {
            if (!isFirebaseReady || !db || !userId) return;
            try {
                const doc = await db.collection('users').doc(userId).get();
                if (doc.exists) return; // Déjà des données dans Firebase, rien à migrer

                const savedList = localStorage.getItem('groceryList');
                const savedMeals = localStorage.getItem('meals');
                if (!savedList) return; // Rien à migrer

                const dataToMigrate = {
                    groceryList: JSON.parse(savedList),
                    meals: savedMeals ? JSON.parse(savedMeals) : {},
                    mealSections: {},
                    mealSectionOrder: [],
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                };
                await db.collection('users').doc(userId).set(dataToMigrate);
                console.log('✅ Données locales migrées vers Firebase Auth');
            } catch (e) {
                console.error('Erreur migration:', e);
            }
        }

        // ========================================
        // AUTH STATE LISTENER — Point d'entrée principal
        // ========================================
        auth.onAuthStateChanged(async (user) => {
            if (user) {
                currentUser = user;
                userId = user.uid;
                isFirebaseReady = (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

                document.getElementById('authModal').classList.remove('show');
                document.getElementById('createAccountModal').classList.remove('show');

                await migrateLocalDataIfNeeded();

                // Charger les préférences utilisateur (listes membres + liste par défaut)
                let defaultListId = null;
                if (isFirebaseReady) {
                    try {
                        const userDoc = await db.collection('users').doc(userId).get();
                        const userData = userDoc.exists ? userDoc.data() : {};
                        userListMemberships = userData.listMemberships || [];
                        defaultListId = userData.defaultListId || null;
                    } catch (e) {
                        console.error('Erreur lecture préférences utilisateur:', e);
                    }
                }

                // Décider quelle liste ouvrir
                console.log(`📋 Préférences: defaultListId=${defaultListId}, memberships=[${userListMemberships.join(',')}]`);
                if (defaultListId) {
                    // Liste par défaut configurée → vérifier qu'elle est valide
                    const valid = await checkListMembership(defaultListId);
                    if (valid) {
                        activeListId = defaultListId;
                    }
                } else if (userListMemberships.length === 1) {
                    // Une seule liste partagée → l'ouvrir directement
                    const valid = await checkListMembership(userListMemberships[0]);
                    if (valid) activeListId = userListMemberships[0];
                } else if (userListMemberships.length > 1) {
                    // Plusieurs listes sans défaut → afficher le sélecteur
                    await showListPicker();
                    return; // showListPicker → selectList → continue l'init
                }
                console.log(`📋 Liste active: ${activeListId || 'liste personnelle'}`);

                if (activeListId) {
                    subscribeToSharedList(activeListId);
                    await updatePresence(true);
                    startPresenceHeartbeat();
                } else {
                    await initializeDefaultItems();
                    // Réconciliation: si localStorage avait des données non sync, forcer une sauvegarde
                    if (dataLoaded && isFirebaseReady) {
                        const mealCount = Object.keys(meals).length;
                        if (mealCount > 0) {
                            console.log(`🔄 Réconciliation: ${mealCount} plat(s) trouvé(s), sauvegarde forcée vers Firebase`);
                            await saveToFirebase();
                        }
                    }
                }

                renderCategories();
                renderMeals();
                updateArticlesCollapseState();
                updateShareUI();
                updateActiveListLabel();
            } else {
                // Flush pending save BEFORE resetting state
                if (saveTimeout && dataLoaded && isFirebaseReady && db && userId) {
                    clearTimeout(saveTimeout);
                    const dataToSave = {
                        groceryList: groceryList,
                        meals: meals,
                        mealOrder: mealOrder,
                        mealSections: mealSections,
                        mealSectionOrder: mealSectionOrder,
                        articleSections: articleSections,
                        articleSectionOrder: articleSectionOrder,
                                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    if (activeListId) {
                        dataToSave[`presence.${userId}.lastSeen`] = new Date(0);
                        db.collection('lists').doc(activeListId).set(dataToSave, { merge: true });
                    } else {
                        db.collection('users').doc(userId).set(dataToSave, { merge: true });
                    }
                    saveTimeout = null;
                    console.log('💾 Sauvegarde forcée avant déconnexion auth');
                }
                stopPresenceHeartbeat();
                if (listUnsubscribe) { listUnsubscribe(); listUnsubscribe = null; }
                currentUser = null;
                userId = null;
                activeListId = null;
                userListMemberships = [];
                isFirebaseReady = false;
                dataLoaded = false;
                const listLabel = document.getElementById('activeListName');
                if (listLabel) listLabel.style.display = 'none';
                document.getElementById('authModal').classList.add('show');
            }
        });

        // Close modal when clicking outside
        window.onclick = function(event) {
            const moveModal = document.getElementById('moveModal');
            const renameModal = document.getElementById('renameModal');
            const quantityModal = document.getElementById('quantityModal');
            const mealModal = document.getElementById('mealModal');
            const settingsModal = document.getElementById('settingsModal');
            const addArticleModal = document.getElementById('addArticleModal');
            const mealSectionModal = document.getElementById('mealSectionModal');
            const moveMealSectionModal = document.getElementById('moveMealSectionModal');

            if (event.target === moveModal) {
                closeMoveModal();
            }
            if (event.target === renameModal) {
                closeRenameModal();
            }
            if (event.target === quantityModal) {
                closeQuantityModal();
            }
            if (event.target === mealModal) {
                closeMealModal();
            }
            if (event.target === settingsModal) {
                closeSettingsModal();
            }
            if (event.target === addArticleModal) {
                closeAddArticleModal();
            }
            if (event.target === mealSectionModal) {
                closeMealSectionModal();
            }
            if (event.target === moveMealSectionModal) {
                closeMoveMealSectionModal();
            }
            
            // Close dropdowns when clicking outside
            if (!event.target.closest('.item-actions')) {
                closeAllMenus();
            }
        };

        // Handle Enter key in rename input
        document.addEventListener('DOMContentLoaded', function() {
            const renameInput = document.getElementById('renameInput');
            if (renameInput) {
                renameInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        confirmRename();
                    }
                });
            }

            // Meal section modal Enter key handler
            const mealSectionNameInput = document.getElementById('mealSectionNameInput');
            if (mealSectionNameInput) {
                mealSectionNameInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        confirmMealSection();
                    }
                });
            }

            // Auth modals Enter key handlers
            const loginPasswordInput = document.getElementById('loginPasswordInput');
            if (loginPasswordInput) {
                loginPasswordInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') { loginWithEmail(); }
                });
            }
            const loginEmailInput = document.getElementById('loginEmailInput');
            if (loginEmailInput) {
                loginEmailInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') { loginWithEmail(); }
                });
            }
            const confirmPasswordInput = document.getElementById('confirmPasswordInput');
            if (confirmPasswordInput) {
                confirmPasswordInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') { registerWithEmail(); }
                });
            }

            // Add article modal Enter key handler
            const modalArticleName = document.getElementById('modalArticleName');
            if (modalArticleName) {
                modalArticleName.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        confirmAddArticle();
                    }
                });
            }

            // Quantity modal Enter key handler
            const quantityInput = document.getElementById('quantityInput');
            if (quantityInput) {
                quantityInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        confirmQuantity();
                    }
                });
            }
        });

        // Force save to Firebase before closing the app/browser
        window.addEventListener('beforeunload', function(event) {
            if (!dataLoaded) return; // Ne pas écraser Firebase avec des données vides
            if (saveTimeout) {
                clearTimeout(saveTimeout);
                if (isFirebaseReady && db && userId) {
                    const dataToSave = {
                        groceryList: groceryList,
                        meals: meals,
                        mealOrder: mealOrder,
                        mealSections: mealSections,
                        mealSectionOrder: mealSectionOrder,
                        articleSections: articleSections,
                        articleSectionOrder: articleSectionOrder,
                                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    if (activeListId) {
                        dataToSave[`presence.${userId}.lastSeen`] = new Date(0);
                        db.collection('lists').doc(activeListId).set(dataToSave, { merge: true });
                    } else {
                        db.collection('users').doc(userId).set(dataToSave, { merge: true });
                    }
                    console.log('💾 Sauvegarde forcée avant fermeture');
                }
            } else if (isFirebaseReady && activeListId && userId) {
                // Marquer comme hors-ligne même sans sauvegarde en attente
                db.collection('lists').doc(activeListId).update({
                    [`presence.${userId}.lastSeen`]: new Date(0)
                });
            }
        });

        // Force save when app goes to background (mobile-friendly, beforeunload is unreliable on mobile)
        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'hidden' && dataLoaded && saveTimeout) {
                clearTimeout(saveTimeout);
                if (isFirebaseReady && db && userId) {
                    const dataToSave = {
                        groceryList: groceryList,
                        meals: meals,
                        mealOrder: mealOrder,
                        mealSections: mealSections,
                        mealSectionOrder: mealSectionOrder,
                        articleSections: articleSections,
                        articleSectionOrder: articleSectionOrder,
                                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                    };
                    if (activeListId) {
                        dataToSave[`presence.${userId}.lastSeen`] = new Date(0);
                        db.collection('lists').doc(activeListId).set(dataToSave, { merge: true });
                    } else {
                        db.collection('users').doc(userId).set(dataToSave, { merge: true });
                    }
                    saveTimeout = null;
                    console.log('💾 Sauvegarde forcée (app en arrière-plan)');
                }
            }
        });

        // Register Service Worker for PWA
        let swRegistration = null;
        let updateAvailable = false;

        if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
                navigator.serviceWorker.register('service-worker.js')
                    .then(function(registration) {
                        console.log('✅ Service Worker enregistré:', registration.scope);
                        swRegistration = registration;

                        // Vérifier les mises à jour toutes les 5 minutes
                        setInterval(function() {
                            registration.update();
                        }, 300000); // 5 minutes

                        // Détecter quand une nouvelle version est en attente
                        registration.addEventListener('updatefound', function() {
                            const newWorker = registration.installing;
                            
                            newWorker.addEventListener('statechange', function() {
                                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                    // Nouvelle version disponible !
                                    console.log('🔔 Nouvelle mise à jour disponible !');
                                    updateAvailable = true;
                                    setUpdateStatus('available');
                                }
                            });
                        });

                        // Vérification initiale
                        if (registration.waiting) {
                            updateAvailable = true;
                            setUpdateStatus('available');
                        }
                    })
                    .catch(function(error) {
                        console.log('❌ Échec enregistrement Service Worker:', error);
                        setUpdateStatus('error');
                    });

                // Rafraîchir quand le nouveau service worker prend le contrôle
                let refreshing = false;
                navigator.serviceWorker.addEventListener('controllerchange', function() {
                    if (!refreshing) {
                        refreshing = true;
                        window.location.reload();
                    }
                });
            });
        }

        function setUpdateStatus(status) {
            const iconEl = document.getElementById('updateStatusIcon');
            const textEl = document.getElementById('updateStatusText');
            
            if (!iconEl || !textEl) return;
            
            switch(status) {
                case 'checking':
                    iconEl.textContent = '🔄';
                    iconEl.classList.add('checking');
                    textEl.textContent = 'Vérification...';
                    break;
                case 'uptodate':
                    iconEl.textContent = '✅';
                    iconEl.classList.remove('checking');
                    textEl.textContent = 'À jour';
                    break;
                case 'available':
                    iconEl.textContent = '🔔';
                    iconEl.classList.remove('checking');
                    textEl.textContent = 'Mise à jour !';
                    break;
                case 'error':
                    iconEl.textContent = '⚠️';
                    iconEl.classList.remove('checking');
                    textEl.textContent = 'Erreur';
                    break;
            }
        }

        async function checkForUpdates() {
            if (!swRegistration) {
                alert('Service Worker non disponible. Assurez-vous d\'utiliser l\'app depuis GitHub Pages.');
                return;
            }

            setUpdateStatus('checking');

            try {
                // Forcer la vérification
                await swRegistration.update();
                
                // Attendre un peu pour laisser le temps au service worker de se mettre à jour
                setTimeout(function() {
                    if (swRegistration.waiting || updateAvailable) {
                        // Mise à jour disponible
                        setUpdateStatus('available');
                        
                        if (confirm('✨ Une nouvelle version est disponible !\n\nVoulez-vous mettre à jour maintenant ?\n\n(Vos données seront conservées)')) {
                            updateApp();
                        }
                    } else {
                        // Déjà à jour
                        setUpdateStatus('uptodate');
                        
                        // Remettre l'icône normale après 2 secondes
                        setTimeout(function() {
                            setUpdateStatus('uptodate');
                        }, 2000);
                    }
                }, 1000);
            } catch (error) {
                console.error('Erreur lors de la vérification:', error);
                setUpdateStatus('error');
            }
        }

        function updateApp() {
            if (swRegistration && swRegistration.waiting) {
                // Dire au service worker en attente de prendre le contrôle
                swRegistration.waiting.postMessage({ action: 'skipWaiting' });
            }
        }

// ========================================
// EXPORTS WINDOW — fonctions appelées par onclick dans le HTML
// ========================================
// Auth
window.loginWithEmail = loginWithEmail;
window.registerWithEmail = registerWithEmail;
window.loginWithGoogle = loginWithGoogle;
window.logout = logout;
window.showCreateAccount = showCreateAccount;
window.backToLogin = backToLogin;
window.togglePasswordVisibility = togglePasswordVisibility;

// Settings
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;

// Shared list
window.createSharedList = createSharedList;
window.joinSharedList = joinSharedList;
window.leaveSharedList = leaveSharedList;
window.showShareCode = showShareCode;
window.copyShareCode = copyShareCode;
window.switchList = switchList;
window.selectList = selectList;
window.changeListDefault = changeListDefault;
window.startRenameList = startRenameList;
window.saveRenameList = saveRenameList;
window.cancelRenameList = cancelRenameList;
window.closeListPicker = closeListPicker;

// Meals
window.openMealModal = openMealModal;
window.closeMealModal = closeMealModal;
window.confirmMeal = confirmMeal;
window.toggleMeal = toggleMeal;
window.deleteMeal = deleteMeal;
window.openEditMealModal = openEditMealModal;
window.openRenameMealModal = openRenameMealModal;
window.toggleMealsSection = toggleMealsSection;
window.toggleMealMenu = toggleMealMenu;

// Meal sections
window.openCreateSectionModal = openCreateSectionModal;
window.closeMealSectionModal = closeMealSectionModal;
window.confirmMealSection = confirmMealSection;
window.selectSectionEmoji = selectSectionEmoji;
window.toggleMealSection = toggleMealSection;
window.deleteMealSection = deleteMealSection;
window.openRenameSectionModal = openRenameSectionModal;
window.toggleSectionMenu = toggleSectionMenu;
window.openMoveMealToSectionModal = openMoveMealToSectionModal;
window.closeMoveMealSectionModal = closeMoveMealSectionModal;
window.toggleAllMealSections = toggleAllMealSections;

// Articles
window.openAddArticleModal = openAddArticleModal;
window.closeAddArticleModal = closeAddArticleModal;
window.confirmAddArticle = confirmAddArticle;
window.toggleItem = toggleItem;
window.deleteItem = deleteItem;
window.openRenameModal = openRenameModal;
window.closeRenameModal = closeRenameModal;
window.confirmRename = confirmRename;
window.openQuantityModal = openQuantityModal;
window.closeQuantityModal = closeQuantityModal;
window.confirmQuantity = confirmQuantity;
window.removeQuantity = removeQuantity;
window.openMoveModal = openMoveModal;
window.closeMoveModal = closeMoveModal;
window.toggleArticlesSection = toggleArticlesSection;
window.toggleItemMenu = toggleItemMenu;
window.toggleAllCategories = toggleAllCategories;

// Article sections
window.openCreateArticleSectionModal = openCreateArticleSectionModal;
window.closeArticleSectionModal = closeArticleSectionModal;
window.confirmCreateArticleSection = confirmCreateArticleSection;
window.selectArticleSectionEmoji = selectArticleSectionEmoji;
window.toggleArticleSection = toggleArticleSection;
window.toggleArticleSectionMenu = toggleArticleSectionMenu;
window.deleteArticleSection = deleteArticleSection;
window.openRenameArticleSectionModal = openRenameArticleSectionModal;

// Recipe
window.openRecipeModal = openRecipeModal;
window.closeRecipeModal = closeRecipeModal;
window.saveRecipe = saveRecipe;
window.switchRecipeToEdit = switchRecipeToEdit;

// PWA
window.checkForUpdates = checkForUpdates;
