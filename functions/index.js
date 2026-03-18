// ══════════════════════════════════════════
//  VOLO SST — Cloud Functions
//  Envoie les push notifications FCM quand
//  un doc est créé dans /notifications
// ══════════════════════════════════════════
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();
const messaging = admin.messaging();

// ── Trigger : nouveau doc dans /notifications ──
// Quand sendUrgence() ou triggerUrgencyAlert() écrit dans Firestore,
// cette function s'exécute automatiquement et envoie les push.
exports.sendPushNotification = functions.firestore
  .document('notifications/{notifId}')
  .onCreate(async (snap, context) => {
    const notif = snap.data();
    if (notif.sent) return null; // Déjà traité

    const title = notif.title || 'VOLO SST';
    const body = notif.body || '';
    const type = notif.type || 'INFO';
    const targetRole = notif.targetRole || 'all';

    // 1. Chercher les tokens FCM (filtré par rôle)
    let tokensQuery = db.collection('fcm_tokens');
    if (targetRole === 'chef') {
      tokensQuery = tokensQuery.where('role', 'in', ['CHEF', 'ADMIN']);
    } else if (targetRole === 'sauveteur') {
      tokensQuery = tokensQuery.where('role', 'in', ['CHEF', 'ADMIN', 'SAUVETEUR']);
    }
    // targetRole === 'all' → no filter, send to everyone
    const tokensSnap = await tokensQuery.get();

    if (tokensSnap.empty) {
      console.log('[VOLO FCM] Aucun token FCM trouvé pour role:', targetRole);
      await snap.ref.update({ sent: true, sentAt: new Date().toISOString(), tokensCount: 0 });
      return null;
    }

    // 2. Collecter les tokens
    const tokens = [];
    tokensSnap.forEach(doc => {
      const t = doc.data().token;
      if (t) tokens.push(t);
    });

    if (!tokens.length) {
      await snap.ref.update({ sent: true, sentAt: new Date().toISOString(), tokensCount: 0 });
      return null;
    }

    console.log('[VOLO FCM] Envoi push à', tokens.length, 'destinataires | type:', type);

    // 3. Construire le message FCM
    const message = {
      notification: {
        title: title,
        body: body
      },
      data: {
        type: type,
        notifId: context.params.notifId,
        click_action: 'https://volo-sst.netlify.app/index.html'
      },
      android: {
        priority: 'high',
        notification: {
          channelId: type === 'URGENCE' || type === 'URGENCY_ALERT' ? 'urgence' : 'default',
          sound: 'default'
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1
          }
        }
      },
      tokens: tokens
    };

    // 4. Envoyer
    try {
      const response = await messaging.sendEachForMulticast(message);
      console.log('[VOLO FCM] Résultat:', response.successCount, 'OK,', response.failureCount, 'échecs');

      // Nettoyer les tokens invalides
      if (response.failureCount > 0) {
        const invalidTokens = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const code = resp.error && resp.error.code;
            if (code === 'messaging/invalid-registration-token' ||
                code === 'messaging/registration-token-not-registered') {
              invalidTokens.push(tokens[idx]);
            }
          }
        });
        // Supprimer les tokens invalides de Firestore
        for (const bad of invalidTokens) {
          const badSnap = await db.collection('fcm_tokens').where('token', '==', bad).get();
          badSnap.forEach(doc => doc.ref.delete());
        }
        if (invalidTokens.length) {
          console.log('[VOLO FCM]', invalidTokens.length, 'tokens invalides supprimés');
        }
      }

      // Marquer comme envoyé
      await snap.ref.update({
        sent: true,
        sentAt: new Date().toISOString(),
        tokensCount: tokens.length,
        successCount: response.successCount,
        failureCount: response.failureCount
      });

    } catch (err) {
      console.error('[VOLO FCM] Erreur envoi:', err);
      await snap.ref.update({ sent: false, error: err.message });
    }

    return null;
  });
