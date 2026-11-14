/** Reads the phone's GPS position. Asks for permission on the installed app. */
export async function readGps(): Promise<{ lat: number; lon: number }> {
  const native = await readNative();
  if (native) return native;
  if (!navigator.geolocation) throw new Error('This phone has no GPS reading. Type a start address instead.');
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lon: position.coords.longitude }),
      (error) => reject(new Error(error.code === 1 ? 'Location is turned off. Allow it for Trids Routes, or type a start address.' : 'Could not read your location. Step outside, or type a start address.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 20000 },
    );
  });
}

async function readNative(): Promise<{ lat: number; lon: number } | null> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return null;
    const { Geolocation } = await import('@capacitor/geolocation');
    const permission = await Geolocation.requestPermissions();
    if (permission.location !== 'granted' && permission.coarseLocation !== 'granted') {
      throw new Error('Location is turned off. Allow it for Trids Routes, or type a start address.');
    }
    const position = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
    return { lat: position.coords.latitude, lon: position.coords.longitude };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Location')) throw error;
    return null;
  }
}
