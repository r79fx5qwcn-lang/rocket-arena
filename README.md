# Rocket Arena

Jeu de football en voitures fusées en 3D, inspiré de Rocket League, jouable directement dans le navigateur.
**Three.js** pour le rendu, **moteur physique dédié à 120 Hz** (constantes de Rocket League), **Vite** pour le build, **déploiement statique sur Netlify** (aucun serveur).

## Lancer le projet

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # build de production dans dist/
npm run preview      # sert le build localement
npm run test:physics # 34 vérifications de la physique (headless, Node)
npm test             # tout : physique, flicks/atterrissages, lissage de l'arène, matchs de bots
```

Node 18 ou plus récent (Netlify est configuré sur Node 20).

## Déployer sur Netlify

1. Pousse le dossier dans un dépôt GitHub (`git init`, `git add .`, `git commit`, `git push`).
2. Sur Netlify : **Add new site → Import an existing project → GitHub** et choisis le dépôt.
3. Netlify lit `netlify.toml` tout seul : commande `npm run build`, dossier publié `dist`, Node 20.
4. Clique sur **Deploy**. Le jeu est accessible sur l'URL publique fournie.

Aucune variable d'environnement ni backend n'est nécessaire. Tout est généré dans le navigateur : textures, modèles 3D et sons. Aucun fichier média n'est à télécharger.

## Commandes (clavier AZERTY, configurables)

| Touche | Action |
|---|---|
| Z / S | Accélérer / reculer. En l'air : piquer / cabrer |
| Q / D | Tourner. En l'air : lacet |
| Espace (ou clic droit) | Sauter (maintenir = plus haut). 2ᵉ appui : double saut, ou flip si une direction est tenue |
| Maj gauche (ou clic gauche) | Boost |
| Maj droite | Powerslide. En l'air : air roll libre |
| A / E | Air roll gauche / droite |
| C | Ball Cam on/off |
| Flèches | Commandes alternatives (conduite + aérien) |
| Tab | Tableau des scores |
| Échap | Pause |
| R, 1-6, B, F | Entraînement libre : reset, situations (balle roulante, aérien, balle sur le toit, mur, air dribble, plafond), boost illimité, stop |

Les touches sont liées à leur **position physique** : ZQSD sur un clavier AZERTY correspond à WASD sur un clavier QWERTY.
**Manette** (API Gamepad, Xbox/PlayStation) : RT/LT accélérer/reculer, A sauter, B boost, X powerslide/air roll, LB/RB air roll, Y ball cam, stick droit pour la caméra, Start pour la pause.

## Architecture

```
src/
  physics/            Moteur physique pur JS (aucune dépendance, tourne aussi dans Node)
    constants.js      Constantes Rocket League (uu, s) : boost, sauts, flips, courbes, pads…
    math.js           Vec3 / Quat / courbes linéaires par morceaux
    Arena.js          Arène en champ de distance signée (SDF) + ray casts (sphere tracing)
    Ball.js           Balle : gravité, traînée, rebonds (restitution 0.6), frottement, rotation
    Car.js            Voiture : 4 roues ray-cast, suspension, pneus, sticky forces, boost,
                      saut/double saut, dodges (flip cancel, Z-damping), air control, auto-flip
    collisions.js     Voiture↔arène (26 points de la hitbox), voiture↔balle (OBB-sphère + impulsion
                      « Psyonix »), voiture↔voiture (bumps, démolitions supersoniques)
    BoostPads.js      34 pads (6 grands à 100, 28 petits à 12), recharges 10 s / 4 s
    BallPredictor.js  Prédiction de trajectoire (IA, statistiques tirs/arrêts)
    PhysicsWorld.js   Pas fixe 120 Hz, ordre de résolution, événements
    Controls.js       État d'entrée normalisé (sérialisable sur 6 octets pour le réseau)
  render/             Three.js : arène, stade + public, voiture procédurale, balle, pads,
                      particules GPU, effets (but, impacts, démolitions), caméra
  audio/              Sons synthétisés en Web Audio (moteur, boost, sauts, impacts, buts, foule)
  input/              Clavier + souris + manette, remappage
  ai/                 Bots (3 niveaux) : kickoffs, interceptions, tirs, sauts, aériens, rotations
  modes/              Déroulé du match : compte à rebours, chrono, buts, prolongation, fin
  ui/                 Menus (jouer, garage, paramètres, aide, pause), HUD, écran de fin
  net/                Interface réseau prête pour le multijoueur en ligne (pas de backend requis)
  core/               Boucle de jeu (physique 120 Hz + rendu interpolé), paramètres persistants
tests/                Tests headless : physique (physics.test.mjs) et matchs de bots (bots.test.mjs)
```

## Physique : ce qui est reproduit

- **Unités et constantes RL** : gravité 650 uu/s², vitesse max 2300, supersonique à 2200, boost 33,3/s, accélération de boost 991,7 (sol) et 1058 (air), courbe d'accélération du moteur (1600 → 160 → 0 à 1410 uu/s), freinage 3500, angles de braquage selon la vitesse.
- **Sauts** : impulsion 291,7 + accélération 1458 pendant le maintien (0,025 à 0,2 s), double saut et flip disponibles pendant 1,25 s après le saut, ou sans limite si la voiture a quitté le sol sans sauter.
- **Dodges** : impulsions avant, arrière, côté et diagonale dépendant de la vitesse (×2,5 en arrière, ×1,9 en côté), Z-damping (le flip « fige » la vitesse verticale), flip cancel (half flip, speed flip), verrouillage du tangage pendant le dodge.
- **Contrôle aérien** : couples et amortissements mesurés (roulis 36, tangage 12,1, lacet 8,9 rad/s²), vitesse angulaire max 5,5 rad/s.
- **Sol / murs / plafond** : suspension ressort-amortisseur, frottement latéral des pneus avec courbe de glissement, powerslide, sticky force qui permet de rouler sur les murs et au plafond (en accélérant), transitions courbes.
- **Balle** : rayon 91,25, masse 1/6 de la voiture, restitution 0,6, frottement 0,35, rotation couplée aux contacts, impulsion supplémentaire de frappe (courbe Psyonix), vitesse max 6000.
- **Flip reset** : quand au moins 3 roues touchent la balle en l'air, le flip est récupéré.
- **Démolitions et bumps** : courbes de vitesse RL, réapparition après 3 s.

Résultats de `npm run test:physics` (extraits) : vitesse max 1410 uu/s ; supersonique en 1,6 s ; saut maintenu à 236 uu ; double saut à 489 uu ; front flip +572 uu/s et atterrissage sur les roues ; half flip qui retourne la voiture ; wave dash +650 uu/s ; ratio de rebond 0,35 ; virage de courbure 0,0038 à 550 uu/s et 0,0014 à 1400 uu/s ; passage sol→mur à 2257 uu/s ; conduite au plafond ; flip reset ; démolition.

## Limites et choix assumés

- **Rapier n'est pas utilisé**. Rocket League tourne sur un contrôleur de voiture spécifique (roues ray-cast, sticky forces, impulsion de frappe, Z-damping…) posé sur un moteur généraliste. Ici, ce contrôleur est réimplémenté à l'identique. Les collisions avec l'arène se font sur un champ de distance analytique : surfaces parfaitement lisses, normales exactes, aucun effet de tunnel ni arête fantôme sur les murs courbes. Le moteur est déterministe, n'a aucune dépendance et se teste dans Node (prérequis pour un serveur de jeu en ligne). Brancher Rapier n'apporterait rien de plus pour ce cas d'usage.
- **Géométrie approchée** : coins verticaux arrondis (rayon 1400 uu) au lieu des pans coupés de RL. Transitions sol/mur de 520 uu, nécessaires pour monter au mur à 2300 uu/s avec la limite de 5,5 rad/s. Près des buts, la courbe se resserre progressivement (300 uu), contourne les poteaux arrondis et continue à l'intérieur des buts (fond et plafond du but arrondis). Il n'y a donc aucun rebord où la voiture peut accrocher (`npm run test:arena` : 2 accrochages sur 600 trajets, sur la barre transversale et en entrant dans le but à 2200 uu/s).
- **Caméra** : sur un mur ou au plafond, elle suit l'orientation de la surface, comme dans RL. Elle ne sort jamais de l'arène : marge de 70 uu, vérifiée sur 72 000 images de trajets aléatoires.
- **Contacts balle → voiture** : la balle fait beaucoup moins tourner la voiture qu'un solide « brut ». Les flicks, dribbles et air dribbles restent ainsi contrôlables. Couchée sur le côté, la voiture se remet seule sur ses roues. Sur le toit, il faut sauter (auto-flip), comme dans RL.
- **Dodges** : l'accélération angulaire (environ 100 rad/s²) et la vitesse de rotation pendant le dodge (10 rad/s, contre 5,5 hors dodge) ont été réglées pour qu'un flip fasse un tour complet en environ 0,65 s, comme dans le jeu. Les valeurs exactes de RL ne sont pas publiques.
- **Plafond** : la sticky force est un peu plus forte au plafond pour pouvoir y rouler en accélérant. En relâchant, on tombe en gardant son flip (ceiling shot).
- **Flicks** : 100 % physiques. L'impulsion de frappe tient compte de la vitesse de la carrosserie au point de contact, donc une voiture qui tourne pendant un dodge frappe plus fort. Mesuré (`npm run test:landing`) : front flick et flick à 45° autour de +900 à +1100 uu/s, musty jusqu'à +1500 uu/s, toujours avec un atterrissage sur les roues.
- **Multijoueur en ligne** : non inclus, car il faudrait un serveur. L'architecture est prête : moteur déterministe headless, `Controls.pack()`, `src/net/NetworkAdapter.js` (squelette WebSocket).
- **Replays** : non inclus. La célébration après un but est une explosion avec caméra orbitale.

## Licence

Projet original. Il ne contient aucun asset, logo ou nom déposé de Rocket League.
