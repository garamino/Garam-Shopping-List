# 🛒 Ma Liste de Courses - Documentation Projet

> Application PWA (Progressive Web App) de gestion de liste de courses avec synchronisation cloud, système de plats/recettes, partage en temps réel et authentification Firebase.

---

## 📋 Table des Matières

1. [Vue d'ensemble](#vue-densemble)
2. [Fonctionnalités](#fonctionnalités)
3. [Architecture Technique](#architecture-technique)
4. [Structure des Données](#structure-des-données)
5. [Fichiers du Projet](#fichiers-du-projet)
6. [Configuration Firebase](#configuration-firebase)
7. [Guide d'utilisation](#guide-dutilisation)
8. [Tests Automatisés](#tests-automatisés)
9. [Optimisations](#optimisations)
10. [Sécurité](#sécurité)
11. [Roadmap](#roadmap)

---

## 🎯 Vue d'ensemble

### Qu'est-ce que c'est ?

Une application web progressive (PWA) permettant de gérer efficacement sa liste de courses avec :
- ✅ Synchronisation cloud automatique (Firebase Firestore)
- ✅ Authentification sécurisée (Firebase Auth — email/mdp + Google)
- ✅ Partage de liste en temps réel entre plusieurs utilisateurs
- ✅ Indicateur de présence (qui est en ligne)
- ✅ Mode hors-ligne complet (localStorage)
- ✅ Système de plats/recettes avec ingrédients auto-cochés
- ✅ Drag & drop pour réorganiser
- ✅ Quantités optionnelles (x7, 2kg, 500g...)
- ✅ Tests automatisés (CI/CD)

### Cas d'usage

- **Personnel** : Gérer sa liste de courses hebdomadaire
- **Couple/Famille** : Liste partagée, modifications visibles en temps réel
- **Planification repas** : Créer des plats avec ingrédients, cocher le plat = tous les ingrédients cochés
- **Mobile-first** : Optimisé pour smartphone au supermarché

---

## ✨ Fonctionnalités

### 1. Gestion des Articles

#### Ajouter un article
- Clic sur **"+ Nouvel article"** (bouton à côté de "📦 Mes Articles")
- Modal s'ouvre → Saisir nom et catégorie
- Article ajouté et synchronisé automatiquement

#### Organiser les articles
- **11 catégories** : Fruits, Légumes, Viande, Poisson, Produits Laitiers, Épicerie, Boulangerie, Surgelés, Boissons, Hygiène, Autre
- **Drag & drop** (⋮⋮) pour réorganiser dans une catégorie
- **Replier/Déplier** chaque catégorie individuellement
- **Replier tout** (bouton ⬍)

#### Actions sur un article
```
⋮ (menu contextuel)
├─ ✏️ Renommer
├─ 📊 Quantité (optionnel)
├─ 📁 Déplacer vers une autre catégorie
└─ 🗑️ Supprimer
```

#### Quantités optionnelles
- Badge bleu cliquable : `[x7]`, `[2kg]`, `[500g]`
- Texte libre : nombres, poids, volumes, fourchettes
- Exemples : `7`, `x10`, `1.5kg`, `2L`, `2-3`

#### Recherche et filtres
- 🔍 **Recherche** : Trouve instantanément un article
- **Filtres** :
  - Tout (tous les articles)
  - À acheter (cochés uniquement)
  - Non sélectionnés (non cochés)

---

### 2. Système de Plats

#### Créer un plat
1. Clic sur **"+ Nouveau plat"**
2. Nommer le plat (ex: "Pâtes Carbonara")
3. Sélectionner les ingrédients nécessaires
4. Sauvegarder

#### Utiliser un plat
- **Cocher le plat** → Tous les ingrédients sont automatiquement cochés
- **Décocher le plat** → Tous les ingrédients sont décochés
- **Drag & drop** (⋮⋮) pour réorganiser les plats

#### Actions sur un plat
```
⋮
├─ ✏️ Renommer
├─ 📝 Modifier les ingrédients
└─ 🗑️ Supprimer
```

#### Avertissement intelligent
Si vous supprimez un article utilisé dans un plat :
```
⚠️ Cet article est utilisé dans 2 plat(s) :
Pâtes Carbonara, Lasagnes

Voulez-vous vraiment le supprimer ?
[Annuler] [OK]
```

---

### 3. Synchronisation

#### Double système de sauvegarde

**localStorage (Immédiat) :**
- ✅ Sauvegarde instantanée à chaque action
- ✅ Fonctionne hors-ligne
- ✅ Pas de délai

**Firebase Cloud (Différé - 5 secondes) :**
- ✅ Debouncing de 5 secondes (économise les appels)
- ✅ Synchronisation entre appareils
- ✅ Sauvegarde forcée avant fermeture (beforeunload)
- ✅ Temps réel via `onSnapshot` pour les listes partagées

#### Indicateurs de synchronisation
```
☁️ Connecté              → Firebase prêt
💾 En attente...          → Modifications non sync (debouncing)
🔄 Synchronisation...     → Appel Firebase en cours
✅ Sauvegardé             → Succès (affiché 2 secondes)
⚠️ Erreur                → Échec de synchronisation
```

---

### 4. Authentification Firebase

**Système Firebase Authentication (email/mot de passe + Google Sign-In) :**
- Création de compte avec email et mot de passe (min. 6 caractères)
- Connexion avec un compte Google existant
- userId = UID Firebase unique généré par Firebase Auth
- Session persistante entre les appareils

**Fonctionnalités :**
```
⚙️ Paramètres
├─ Compte connecté (email affiché)
├─ 🔗 Créer une liste partagée
├─ Rejoindre une liste (saisir un code)
├─ [Si liste partagée active]
│   ├─ 👥 Nom de la liste + indicateurs de présence
│   ├─ Voir le code d'invitation
│   ├─ ⭐ Définir comme liste par défaut
│   ├─ 🔄 Changer de liste
│   └─ Quitter la liste
├─ 🧪 Page de tests (utilisateurs connectés)
└─ 🚪 Déconnexion
```

**Migration automatique :**
Au premier login Firebase Auth, les données existantes en localStorage sont automatiquement migrées vers le nouveau document Firestore lié au UID Firebase.

---

### 5. Partage de Liste en Temps Réel

#### Créer une liste partagée
1. ⚙️ Paramètres → **"🔗 Créer une liste partagée"**
2. Saisir un nom (ex: "Courses de la famille")
3. La liste actuelle est copiée dans la liste partagée
4. Un code court est généré (ex: `K7MN2X`)

#### Rejoindre une liste
1. ⚙️ Paramètres → saisir le code dans le champ → **Rejoindre**
2. L'utilisateur est ajouté comme membre
3. La liste partagée remplace la liste active

#### Synchronisation temps réel
- Utilise `onSnapshot` de Firestore (listener permanent)
- Modifications d'un utilisateur → visibles chez l'autre en < 2 secondes
- Pas besoin de recharger la page

#### Indicateurs de présence
- Visible dans les Paramètres quand une liste partagée est active
- `● alice (vous)` en vert si actif dans les 3 dernières minutes
- `● bob` en gris si inactif
- Heartbeat automatique toutes les 60 secondes

#### Gestion des listes
- Un utilisateur peut être membre de **plusieurs listes**
- Si plusieurs listes sans liste par défaut → sélecteur au démarrage
- **"⭐ Définir par défaut"** → ouvre directement cette liste à la connexion
- **"🔄 Changer de liste"** → réaffiche le sélecteur

---

### 6. Progressive Web App (PWA)

#### Installation
- **Chrome/Edge** : Icône "Installer" dans la barre d'adresse
- **Safari iOS** : Partager → "Sur l'écran d'accueil"
- **Android** : Bannière d'installation automatique

#### Fonctionnalités PWA
- ✅ **Icônes** : 192px et 512px
- ✅ **Service Worker** : Cache pour mode hors-ligne
- ✅ **Manifest** : Métadonnées de l'app
- ✅ **Mises à jour** : Icône cliquable pour installer les MAJ

---

## 🏗️ Architecture Technique

### Stack Technologique

| Composant | Technologie | Raison |
|-----------|-------------|--------|
| Frontend | HTML/CSS/JavaScript vanilla | Simplicité, performance, pas de framework |
| Base de données | Firebase Firestore | Temps réel (onSnapshot), gratuit, facile |
| Authentification | Firebase Authentication | Email/mdp + Google, sécurisé, gratuit |
| Cache local | localStorage | Instantané, mode offline |
| PWA | Service Worker + Manifest | Installation, offline, native-like |
| Hosting | GitHub Pages | Gratuit, HTTPS, déploiement auto |
| CI/CD | GitHub Actions | Tests automatiques à chaque commit |
| Tests | Playwright (headless Chrome) | Tests E2E automatisés |

---

### Patterns et Principes

#### 1. Progressive Enhancement
- Base fonctionnelle sans JavaScript (HTML sémantique)
- Amélioration progressive avec JS
- Graceful degradation si Firebase indisponible

#### 2. Mobile-First
- Design optimisé pour smartphone
- Touch-friendly (grandes zones de clic)
- Pas de hover effects critiques

#### 3. Offline-First
- localStorage comme source de vérité locale
- Firebase comme source de vérité cloud
- App utilisable sans connexion (liste perso)

#### 4. Debouncing + Real-time hybride
- Liste personnelle : debouncing 5s + `set()`
- Liste partagée : debouncing 5s + `set()` pour écriture, `onSnapshot` pour lecture

#### 5. Sécurité Anti-XSS
- Fonction `escapeHtml()` appliquée sur tous les noms d'articles et de plats avant injection dans `innerHTML`
- Empêche l'exécution de code HTML/JS malveillant saisi par l'utilisateur

---

## 📊 Structure des Données

### Format localStorage

```javascript
{
  "groceryList": {
    "fruits": [
      {
        "id": 1709123456789,
        "name": "Bananes",
        "checked": true,
        "quantity": "7"
      }
    ],
    "legumes": [ ... ]
  },
  "meals": {
    "1709123456791": {
      "name": "Pâtes Carbonara",
      "selected": false,
      "ingredients": [
        { "category": "epicerie", "itemId": 1709123456789 }
      ]
    }
  },
  "collapsedCategories": {
    "fruits": false,
    "legumes": true
  },
  "mealsCollapsed": false,
  "articlesCollapsed": false
}
```

### Format Firebase Firestore

#### Collection `users/{uid}` — Liste personnelle + préférences

```javascript
{
  "groceryList": { ... },
  "meals": { ... },
  "collapsedCategories": { ... },
  "listMemberships": ["listId1", "listId2"],  // Listes partagées rejointes
  "defaultListId": "listId1",                  // null = liste perso par défaut
  "lastUpdated": Timestamp
}
```

#### Collection `lists/{listId}` — Liste partagée

```javascript
{
  "name": "Courses de la famille",
  "groceryList": { ... },
  "meals": { ... },
  "collapsedCategories": { ... },
  "members": ["uid1", "uid2"],
  "memberEmails": {
    "uid1": "alice@example.com",
    "uid2": "bob@gmail.com"
  },
  "ownerId": "uid1",
  "presence": {
    "uid1": { "email": "alice@...", "lastSeen": Timestamp },
    "uid2": { "email": "bob@...", "lastSeen": Timestamp }
  },
  "lastUpdated": Timestamp
}
```

#### Collection `inviteCodes/{code}` — Codes d'invitation courts

```javascript
{
  "listId": "abc123xyz",
  "createdBy": "uid1",
  "createdAt": Timestamp
}
```

---

## 📁 Fichiers du Projet

### Structure

```
liste-courses/
├── 📄 liste-courses.html          # Application principale (~3500+ lignes)
├── 📄 tests.html                  # Page de tests automatisés
├── 📄 service-worker.js           # Service Worker PWA (cache)
├── 📄 manifest.json               # Manifest PWA (métadonnées)
├── 🖼️ icon-192.png               # Icône PWA 192x192px
├── 🖼️ icon-512.png               # Icône PWA 512x512px
├── 🖼️ header-logo.png            # Logo header 120x120px
├── 📄 claude.md                   # Ce fichier (documentation)
├── 📄 GUIDE-TESTS.md              # Guide des tests automatisés
├── 📁 .github/
│   └── 📁 workflows/
│       └── 📄 test.yml            # GitHub Actions (CI/CD)
└── 📄 README.md                   # (Optionnel) README GitHub
```

---

### Détail des fichiers

#### liste-courses.html (Principal)
**Taille** : ~3500 lignes
**Contenu** :
- HTML complet (structure + modales)
- CSS inline (~900 lignes)
- JavaScript vanilla (~2500 lignes)
- Firebase SDK (CDN) : App, Firestore, Auth

**Sections JS principales :**
```javascript
// Sécurité
- escapeHtml(str)             // Anti-XSS, appliqué sur tous les noms

// Firebase Auth
- loginWithEmail()            // Connexion email/mdp
- registerWithEmail()         // Inscription email/mdp
- loginWithGoogle()           // Connexion Google Sign-In
- logout()                    // Déconnexion Firebase

// Partage de liste
- createSharedList()          // Créer une liste nommée + code d'invitation
- joinSharedList()            // Rejoindre via code court
- leaveSharedList()           // Quitter une liste partagée
- subscribeToSharedList()     // onSnapshot listener temps réel
- checkListMembership()       // Vérifier qu'on est encore membre
- showListPicker()            // Sélecteur de liste (multi-listes)
- selectList()                // Choisir + optionnel: définir par défaut

// Présence
- updatePresence(online)      // Mettre à jour lastSeen dans Firestore
- startPresenceHeartbeat()    // Heartbeat toutes les 60s
- renderPresenceIndicators()  // Afficher les dots en ligne/hors-ligne

// Sauvegarde
- saveToLocalStorage()        // Sauvegarde locale immédiate + debouncing
- saveToFirebase()            // Cible lists/{id} ou users/{uid} selon contexte
- migrateLocalDataIfNeeded()  // Migration one-shot localStorage → Firebase

// Auth listener
- auth.onAuthStateChanged()   // Point d'entrée principal de l'app

// Rendu
- renderCategories()          // Afficher les catégories d'articles
- renderMeals()               // Afficher les plats
- updateShareUI()             // Afficher/masquer sections partage dans Paramètres

// Articles
- addItem() / deleteItem() / toggleItem()
- openQuantityModal() / confirmQuantity()
- openRenameModal() / confirmRename()
- openMoveModal() / moveItemToCategory()

// Plats
- openMealModal() / confirmMeal()
- toggleMeal() / deleteMeal()
- openEditMealModal() / confirmEditMeal()

// Drag & drop
- handleDragStart/End/Over/Drop()
- initializeDragAndDrop()
- initializeMealsDragAndDrop()
```

---

## ⚙️ Configuration Firebase

### Informations de connexion

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyBJjoBkEk-FdZ3gjfmKhGyCFc1tA7JXz5g",
  authDomain: "liste-course-8c2cf.firebaseapp.com",
  projectId: "liste-course-8c2cf",
  storageBucket: "liste-course-8c2cf.firebasestorage.app",
  messagingSenderId: "426451396001",
  appId: "1:426451396001:web:4789552edad9f52f5c97e0"
};
```

### SDK Firebase chargés

```html
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js"></script>
```

### Règles Firestore (Actuelles)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    match /lists/{listId} {
      allow read, write: if request.auth != null && request.auth.uid in resource.data.members;
      allow create: if request.auth != null && request.auth.uid in request.resource.data.members;
    }
    match /inviteCodes/{code} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
    }
  }
}
```

### Restrictions API Key (Configurées)

**Application restrictions — HTTP referrers :**
- `https://garamino.github.io/*`
- `https://liste-course-8c2cf.firebaseapp.com/*`
- `https://liste-course-8c2cf.web.app/*`
- `http://localhost:*`
- `http://127.0.0.1:*`

**API restrictions :**
- Cloud Firestore API
- Identity Toolkit API (requis pour Firebase Auth)

### Providers Firebase Auth (activés)

- ✅ Email / Mot de passe
- ✅ Google Sign-In

---

## 📖 Guide d'utilisation

### Première utilisation

#### 1. Créer un compte
```
Écran de connexion
├─ Saisir email + mot de passe → [Se connecter]
├─ [🔵 Continuer avec Google]
└─ [Créer un compte]
    ├─ Email
    ├─ Mot de passe (min. 6 car.)
    └─ Confirmer le mot de passe → [Créer mon compte]
```

#### 2. Ajouter des articles
```
📦 Mes Articles ▼ [+ Nouvel article]
    ↓
Modal "Ajouter un article"
    ├─ Nom : Bananes
    └─ Catégorie : 🍎 Fruits → [Ajouter]
        ↓
✅ Article ajouté dans Fruits
```

#### 3. Partager sa liste
```
⚙️ Paramètres → [🔗 Créer une liste partagée]
    ↓
Nom : "Courses de la famille"
    ↓
Code généré : K7MN2X
    ↓
Partager ce code avec l'autre utilisateur
```

#### 4. Rejoindre une liste partagée
```
⚙️ Paramètres → saisir "K7MN2X" → [Rejoindre]
    ↓
✅ Liste "Courses de la famille" active
    ↓
● alice (vous)  ● bob
```

---

### Workflow quotidien avec liste partagée

**Alice (à la maison) :**
1. Ouvre l'app → liste partagée "Courses famille" active
2. Coche les plats de la semaine → ingrédients auto-cochés
3. Ajoute : Pain [3], Lait [2L]
4. Bob voit les modifications en temps réel sur son téléphone

**Bob (au supermarché) :**
1. Ouvre l'app → même liste partagée
2. Coche les articles au fur et à mesure
3. Alice voit les articles cochés en temps réel
4. Filtrer sur "Non sélectionnés" pour voir ce qui reste

---

## 🧪 Tests Automatisés

### Page de tests : tests.html

**Accès :**
- Direct : `https://garamino.github.io/Garam-Shopping-List/tests.html`
- Via paramètres : ⚙️ → 🧪 Mode Développeur → Ouvrir la page de tests

### 6 Tests implémentés

1. **Debouncing (5s)** — Vérifie qu'un seul appel Firebase est fait après plusieurs actions rapides
2. **Sauvegarde Forcée** — Vérifie la sauvegarde lors du beforeunload
3. **Ajout Article** — Crée un article et vérifie sa présence dans Firebase
4. **Suppression Article** — Crée puis supprime, vérifie l'absence dans Firebase
5. **Création Plat** — Crée un plat avec ingrédients et vérifie dans Firebase
6. **Cocher Plat** — Vérifie que cocher un plat coche tous ses ingrédients

### GitHub Actions (CI/CD)

```
Push sur main → GitHub Actions → Playwright → 6 tests → Badge vert/rouge
```

**Durée totale** : ~40 secondes

---

## ⚡ Optimisations

### 1. Debouncing Firebase (5 secondes)

**Impact :**
```
AVANT : Session 40 actions = 40 écritures Firebase
APRÈS : Session 40 actions = ~12-15 écritures Firebase
Économie : 60-70% 📉
```

### 2. onSnapshot pour les listes partagées

- Remplace les lectures `get()` ponctuelles par un listener permanent
- Les mises à jour des autres utilisateurs arrivent automatiquement
- Pas de polling, pas de rechargement

### 3. Sauvegarde Forcée (beforeunload)

Si l'utilisateur ferme l'app en < 5 secondes, la sauvegarde est forcée immédiatement. La présence est aussi mise à jour (lastSeen = 0) pour signaler la déconnexion.

### 4. Heartbeat de présence (60s)

Toutes les 60 secondes, l'app met à jour `lastSeen` dans Firestore. Un utilisateur est considéré "en ligne" si son lastSeen date de moins de 3 minutes.

### 5. Anti-XSS (escapeHtml)

```javascript
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str || '');
    return div.innerHTML;
}
```
Appliqué systématiquement sur : `item.name`, `meal.name`, noms d'ingrédients dans les labels.

---

## 🔒 Sécurité

### État actuel : Sécurisé (v2.0)

| Aspect | État |
|--------|------|
| Authentification | ✅ Firebase Auth (email/mdp + Google) |
| Isolation des données | ✅ Règles Firestore par UID Firebase |
| Accès liste partagée | ✅ Vérifié par membership (`members` array) |
| XSS | ✅ escapeHtml() sur toutes les entrées utilisateur |
| Clé API | ✅ Restreinte par domaine HTTP + API |
| Brute-force | ✅ Firebase Auth bloque automatiquement |

### Restrictions API Key

La clé API Firebase est visible dans le code source (pratique standard pour apps web). Elle est sécurisée par :
1. **Restriction de domaine** : ne fonctionne que depuis `garamino.github.io`, Firebase et localhost
2. **Restriction d'API** : uniquement Firestore et Identity Toolkit
3. **Règles Firestore** : chaque utilisateur ne peut accéder qu'à ses propres données ou aux listes dont il est membre

### Ce qui reste à améliorer

- ⚠️ Les codes d'invitation `inviteCodes` ne sont pas nettoyés (peuvent s'accumuler)
- ⚠️ Pas de limite sur le nombre de listes qu'un utilisateur peut créer
- ⚠️ Le propriétaire d'une liste ne peut pas exclure un membre

---

## 🗺️ Roadmap

### ✅ Fonctionnalités Actuelles (v2.0)

- ✅ Gestion articles (CRUD complet)
- ✅ Gestion plats (création, ingrédients auto-cochés)
- ✅ Quantités optionnelles (badges)
- ✅ Drag & drop (réorganisation)
- ✅ Synchronisation Firebase (debouncing 5s)
- ✅ Mode offline (localStorage)
- ✅ PWA (installation, service worker)
- ✅ Tests automatisés (6 tests + CI/CD)
- ✅ Responsive mobile-first
- ✅ Indicateurs de sync visuels
- ✅ **Firebase Authentication (email/mdp + Google Sign-In)**
- ✅ **Partage de liste en temps réel (onSnapshot)**
- ✅ **Indicateur de présence (qui est en ligne)**
- ✅ **Multi-listes avec sélecteur et liste par défaut**
- ✅ **Protection XSS (escapeHtml)**

---

### 🔜 Fonctionnalités Prévues (v3.0)

#### Priorité Haute ⭐⭐⭐

**1. Mode Hors-ligne Amélioré**
- Compteur de modifications non sync
- Bouton "Synchroniser maintenant"
- Indicateur connexion (vert/rouge)
- Durée estimée : 2-3 heures

**2. Nettoyage des inviteCodes**
- Expiration automatique des codes après 7 jours
- Cloud Function ou règle Firestore TTL
- Durée estimée : 1-2 heures

#### Priorité Moyenne ⭐⭐

**3. Smart Suggestions & Historique**
- Suggestions basées sur fréquence d'achat
- Templates de listes ("Ma liste du lundi")
- Durée estimée : 5-7 heures

**4. Mode Sombre**
- Toggle dans paramètres
- Préférence sauvegardée
- Durée estimée : 1-2 heures

**5. Export / Impression**
- PDF de la liste
- Partage WhatsApp/SMS
- Durée estimée : 3-4 heures

**6. Gestion des membres (admin)**
- Le propriétaire peut retirer un membre
- Rôles : admin / éditeur
- Durée estimée : 3-4 heures

#### Priorité Basse ⭐

**7. Statistiques**
- Articles les plus achetés, fréquence
- Graphiques
- Durée estimée : 4-6 heures

**8. Catégories personnalisées**
- Créer ses propres catégories + icônes
- Durée estimée : 2-3 heures

**9. Scan codes-barres** (Avancé)
- Ajouter article par scan
- Base OpenFoodFacts
- Durée estimée : 8-10 heures

---

## 📊 Métriques & Performance

### Limites Firebase (Gratuit)

**Quotas quotidiens :**
- ✅ 50,000 lectures/jour
- ✅ 20,000 écritures/jour
- ✅ 1 GB stockage
- ✅ 10 GB bande passante/mois

**Note onSnapshot :** Chaque listener `onSnapshot` actif compte comme une lecture à chaque modification reçue. Pour 5 utilisateurs simultanés → impact négligeable.

**Authentification :** Gratuit jusqu'à 50,000 utilisateurs actifs/mois.

---

### Performance Web

**Lighthouse Score (mobile) :**
- Performance : 95/100
- Accessibilité : 92/100
- Best Practices : 100/100
- SEO : 90/100
- PWA : ✅ Installable

---

## 🤝 Contribution

### Conventions de code

**JavaScript :**
- camelCase pour variables et fonctions
- Indentation : 4 espaces
- `escapeHtml()` obligatoire avant tout `innerHTML` avec données utilisateur
- Fonctions async/await pour toutes les opérations Firebase

**CSS :**
- kebab-case pour classes
- Mobile-first (media queries min-width)

**HTML :**
- Indentation : 4 espaces
- Attributs entre guillemets doubles

---

### Git Workflow

```bash
git clone https://github.com/garamino/liste-courses.git
git checkout -b feature/nom-feature
# ... modifications ...
git commit -m "feat: Description de la feature"
git push origin feature/nom-feature
# Pull Request → Tests auto → Merge si OK
```

**Format des commits :**
- `feat:` Nouvelle fonctionnalité
- `fix:` Correction de bug
- `docs:` Documentation
- `style:` Formatage, CSS
- `refactor:` Refactoring code
- `test:` Ajout/modification tests
- `security:` Correction de sécurité

---

## 📜 Licence

(À définir - Suggestions : MIT, Apache 2.0, ou usage privé)

---

## 🙏 Remerciements

- **Firebase** : Backend gratuit et performant (Auth + Firestore)
- **GitHub Pages** : Hosting gratuit et fiable
- **Claude (Anthropic)** : Assistance au développement
- **Communauté open-source** : Inspiration et outils

---

**Dernière mise à jour** : Mars 2026
**Version** : 2.0
**Auteur** : Garamino

---

*Ce document est vivant et sera mis à jour au fur et à mesure de l'évolution du projet.*
