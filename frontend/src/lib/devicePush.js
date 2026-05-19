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

  const existingRegistration = await navigator.serviceWorker.getRegistration();
  return existingRegistration || navigator.serviceWorker.register('/sw.js');
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
  const existingSubscription = await registration.pushManager.getSubscription();
  const subscription = existingSubscription || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey)
  });

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
