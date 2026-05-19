import { pushSubscriptionsApi } from './api';

const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

export const devicePushSupported = () => (
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window
);

export const devicePushConfigured = () => Boolean(vapidPublicKey);

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
};

export const getServiceWorkerRegistration = async () => {
  if (!devicePushSupported()) return null;

  // getRegistration('/') returns the SW controlling this scope if one exists.
  // Registering again when one already exists is a no-op (returns the existing one).
  const existingRegistration = await navigator.serviceWorker.getRegistration('/');
  if (existingRegistration) return existingRegistration;

  return navigator.serviceWorker.register('/sw.js');
};

/**
 * Called on app load to keep the service worker alive between browser sessions.
 * If the user previously enabled push, we re-register the SW so it is active
 * and ready to handle incoming push events — even after a browser restart.
 */
export const ensureServiceWorkerForPush = async () => {
  if (!devicePushSupported()) return;

  // Only bother if there is an existing push subscription. Avoids registering
  // the SW for users who never enabled push.
  try {
    const tempReg = await navigator.serviceWorker.getRegistration('/');
    if (!tempReg) {
      // No SW yet — check if there is a subscription stored (stale state after
      // a browser profile wipe). If not, skip registration.
      const reg = await navigator.serviceWorker.register('/sw.js');
      await reg.pushManager.getSubscription(); // triggers SW activation
    }
  } catch {
    // Non-fatal — push will still work when the user next visits Profile
  }
};

export const getBrowserPushSubscription = async () => {
  const registration = await getServiceWorkerRegistration();
  if (!registration) return null;

  return registration.pushManager.getSubscription();
};

const serializeSubscription = (subscription) => {
  const subscriptionJson = subscription.toJSON();

  return {
    endpoint: subscription.endpoint,
    p256dh_key: subscriptionJson.keys?.p256dh,
    auth_key: subscriptionJson.keys?.auth
  };
};

export const enableDevicePush = async () => {
  if (!devicePushSupported()) {
    throw new Error('Device notifications are not supported in this browser');
  }

  if (!devicePushConfigured()) {
    throw new Error('Device notifications are not configured for this app');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Device notification permission was not granted');
  }

  const registration = await getServiceWorkerRegistration();
  let subscription;
  try {
    const existingSubscription = await registration.pushManager.getSubscription();
    subscription = existingSubscription || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
    });
  } catch (err) {
    // Brave (and some Firefox configs) block Google's FCM push relay.
    // The browser throws "Registration failed - push service error" in that case.
    const isBraveOrFcmBlock = (
      err?.message?.toLowerCase().includes('push service') ||
      err?.message?.toLowerCase().includes('registration failed') ||
      err?.name === 'AbortError'
    );
    if (isBraveOrFcmBlock) {
      throw new Error(
        'Your browser blocked the push service. In Brave, go to Settings → Privacy & Security and enable "Use Google services for push messaging", then try again.'
      );
    }
    throw err;
  }

  await pushSubscriptionsApi.create(serializeSubscription(subscription));
  return subscription;
};

export const disableDevicePush = async () => {
  const subscription = await getBrowserPushSubscription();
  if (!subscription) return;

  try {
    await pushSubscriptionsApi.remove(subscription.endpoint);
  } finally {
    await subscription.unsubscribe();
  }
};
