# 📱 Ma Liste de Courses - PWA

Votre application de liste de courses est maintenant une Progressive Web App (PWA) !

## 📦 Fichiers inclus

- `liste-courses.html` - L'application principale
- `manifest.json` - Configuration de la PWA
- `service-worker.js` - Permet le fonctionnement hors ligne
- `icon-192.png` - Icône 192x192 pixels
- `icon-512.png` - Icône 512x512 pixels

## 🚀 Installation sur votre smartphone

### Option A : Hébergement en ligne (RECOMMANDÉ)

Pour profiter pleinement de la PWA, vous devez héberger ces fichiers en ligne. Voici comment faire **GRATUITEMENT** :

#### Méthode 1 : GitHub Pages (Gratuit, facile)

1. Créez un compte sur https://github.com (gratuit)
2. Créez un nouveau repository (dépôt) nommé "liste-courses"
3. Uploadez TOUS les fichiers (HTML, JSON, JS, PNG)
4. Allez dans Settings > Pages
5. Sélectionnez la branche "main" et cliquez sur Save
6. Votre app sera disponible à : `https://votre-nom.github.io/liste-courses/liste-courses.html`

#### Méthode 2 : Netlify (Gratuit, très simple)

1. Allez sur https://www.netlify.com
2. Créez un compte gratuit
3. Faites glisser le dossier contenant tous vos fichiers
4. Votre app est en ligne instantanément !
5. URL fournie : `https://nom-aleatoire.netlify.app`

### Option B : Test en local (limité)

1. Mettez tous les fichiers dans le même dossier
2. Ouvrez `liste-courses.html` avec Chrome ou Edge sur votre téléphone
3. L'installation PWA ne fonctionnera pas complètement, mais l'app sera utilisable

---

## 📲 Comment installer la PWA sur votre téléphone

### Sur Android (Chrome)

1. Ouvrez l'URL de votre app dans Chrome
2. Un popup apparaît : "Ajouter à l'écran d'accueil"
3. Ou cliquez sur le menu (⋮) > "Installer l'application"
4. L'icône apparaît sur votre écran d'accueil !

### Sur iPhone (Safari)

1. Ouvrez l'URL dans Safari
2. Appuyez sur le bouton "Partager" (carré avec flèche)
3. Sélectionnez "Sur l'écran d'accueil"
4. Nommez l'app et confirmez

---

## ✨ Avantages de la PWA

✅ **Fonctionne hors ligne** - Utilisable sans Internet
✅ **Icône sur l'écran d'accueil** - Comme une vraie app
✅ **Pas de téléchargement depuis le Play Store** - Installation directe
✅ **Mises à jour automatiques** - Quand vous mettez à jour les fichiers en ligne
✅ **Données sauvegardées** - Votre liste reste même après mise à jour
✅ **Rapide** - Tout est en cache

---

## 🔄 Comment mettre à jour l'application

### Si hébergée en ligne :
1. Modifiez `liste-courses.html`
2. Uploadez la nouvelle version sur GitHub Pages ou Netlify
3. Les utilisateurs verront la mise à jour automatiquement au prochain chargement

**Important** : Changez la version dans `service-worker.js` :
```javascript
const CACHE_NAME = 'liste-courses-v2'; // Incrémentez le numéro
```

### Si en local :
1. Remplacez le fichier `liste-courses.html`
2. Gardez le MÊME NOM de fichier
3. Vos données seront conservées

---

## 🆘 Besoin d'aide ?

### L'app ne s'installe pas
- Vérifiez que tous les fichiers sont dans le même dossier
- Assurez-vous d'utiliser HTTPS (nécessaire pour les PWA)
- Essayez un autre navigateur (Chrome recommandé)

### Je ne vois pas le bouton "Installer"
- Sur certains navigateurs, il faut aller dans Menu > "Ajouter à l'écran d'accueil"
- Vérifiez que vous êtes bien sur HTTPS (pas file://)

### Mes données ont disparu
- Les données sont liées au nom du fichier ET au domaine
- Gardez toujours le même nom de fichier
- Si vous changez d'hébergement, vos données seront perdues (exportez-les avant)

---

## 🎯 Prochaines étapes suggérées

1. ✅ Hébergez l'app sur GitHub Pages ou Netlify
2. ✅ Installez-la sur votre téléphone
3. ✅ Ajoutez vos aliments et plats
4. ✅ Profitez de votre liste de courses intelligente !

---

**Besoin d'aide pour l'hébergement ?** Je peux vous guider pas à pas ! 🚀
