// ══════════════════════════════════════════
//  VOLO SST — Firebase Cloud Messaging Service Worker
//  Reçoit les push notifications en arrière-plan
// ══════════════════════════════════════════
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCL4KHdek_bTO9EX2YV0K4dQHCGbyspFGw",
  authDomain: "volo-sst-prod.firebaseapp.com",
  projectId: "volo-sst-prod",
  storageBucket: "volo-sst-prod.firebasestorage.app",
  messagingSenderId: "205153358536",
  appId: "1:205153358536:web:3070869d38bc2bda870bfd"
});

var messaging = firebase.messaging();

// Background message handler — quand l'app n'est pas au premier plan
messaging.onBackgroundMessage(function(payload) {
  console.log('[VOLO FCM SW] Background message:', payload);
  var data = payload.data || {};
  var notif = payload.notification || {};

  var title = notif.title || data.title || 'VOLO SST';
  var body = notif.body || data.body || '';
  var icon = '/eagle_tactic.png';
  var badge = '/eagle_tactic.png';
  var tag = data.tag || 'volo-notification';

  // Urgence = notification haute priorité avec vibration
  if (data.type === 'URGENCE' || data.type === 'URGENCY_ALERT') {
    tag = 'volo-urgence';
  }

  return self.registration.showNotification(title, {
    body: body,
    icon: icon,
    badge: badge,
    tag: tag,
    vibrate: [200, 100, 200, 100, 200],
    requireInteraction: data.type === 'URGENCE' || data.type === 'URGENCY_ALERT',
    data: data
  });
});

// Clic sur notification → ouvrir l'app
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(function(clientList) {
        for (var i = 0; i < clientList.length; i++) {
          if (clientList[i].url.includes('index.html') && 'focus' in clientList[i]) {
            return clientList[i].focus();
          }
        }
        return clients.openWindow('/index.html');
      })
  );
});
