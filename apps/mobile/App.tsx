import { useEffect, useState } from 'react';
import { FlatList, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { formatNaira } from '@ninted/domain/money';

const API = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:4000';

type Product = { id: string; title: string; priceKobo: number; city: string; state: string; description?: string; condition?: string; seller?: { id: string; storeName?: string } };
type Screen = 'home' | 'product' | 'login' | 'cart' | 'orders' | 'account';

async function call<T>(path: string, options?: { method?: string; body?: unknown; token?: string | null }): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: options?.method || 'GET',
    headers: {
      'content-type': 'application/json',
      ...(options?.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { message?: string }).message || 'Request failed');
  return data as T;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [token, setToken] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [cart, setCart] = useState<{ quantity: number; product: Product }[]>([]);
  const [orders, setOrders] = useState<{ id: string; status: string; buyerTotalKobo: number }[]>([]);

  useEffect(() => {
    SecureStore.getItemAsync('n9.access').then((saved) => setToken(saved));
    call<{ arrivals: Product[] }>('/home').then((data) => setProducts(data.arrivals)).catch((error: Error) => setMessage(error.message));
  }, []);

  async function persist(next: string) {
    setToken(next);
    await SecureStore.setItemAsync('n9.access', next);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Text style={styles.brand}>Ninted <Text style={styles.em}>9ja</Text></Text>
        <Text style={styles.link} onPress={() => setScreen('home')}>Home</Text>
        <Text style={styles.link} onPress={() => token ? call<{ items: typeof cart }>('/cart', { token }).then((data) => { setCart(data.items); setScreen('cart'); }).catch((error: Error) => setMessage(error.message)) : setScreen('login')}>Basket</Text>
        <Text style={styles.link} onPress={() => setScreen(token ? 'account' : 'login')}>{token ? 'Account' : 'Sign in'}</Text>
      </View>
      {message ? <Text style={styles.error}>{message}</Text> : null}
      {screen === 'home' ? (
        <FlatList
          data={products}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.muted}>No listings yet.</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => { setSelected(item); setScreen('product'); call<{ product: Product }>(`/products/${item.id}`).then((data) => setSelected(data.product)).catch(() => undefined); }}>
              <View style={styles.swatch} />
              <Text style={styles.price}>{formatNaira(item.priceKobo)}</Text>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.muted}>{item.city}, {item.state}</Text>
            </Pressable>
          )}
        />
      ) : null}
      {screen === 'product' && selected ? (
        <ScrollView contentContainerStyle={styles.list}>
          <View style={styles.swatch} />
          <Text style={styles.title}>{selected.title}</Text>
          <Text style={styles.price}>{formatNaira(selected.priceKobo)}</Text>
          <Text>{selected.description}</Text>
          <Text style={styles.muted}>{selected.city}, {selected.state}</Text>
          <Pressable style={styles.button} onPress={() => {
            if (!token || !selected.seller) return setScreen('login');
            call('/cart', { method: 'POST', token, body: { productId: selected.id, quantity: 1 } }).then(() => setMessage('Added to basket')).catch((error: Error) => setMessage(error.message));
          }}><Text style={styles.buttonText}>Add to basket</Text></Pressable>
        </ScrollView>
      ) : null}
      {screen === 'login' ? (
        <View style={styles.list}>
          <TextInput style={styles.input} placeholder="Name, if you are new" value={name} onChangeText={setName} />
          <TextInput style={styles.input} autoCapitalize="none" placeholder="Email" value={email} onChangeText={setEmail} />
          <TextInput style={styles.input} placeholder="Phone, 080…" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <TextInput style={styles.input} secureTextEntry placeholder="Password" value={password} onChangeText={setPassword} />
          <TextInput style={styles.input} placeholder="Email code" value={emailCode} onChangeText={setEmailCode} keyboardType="number-pad" />
          <TextInput style={styles.input} placeholder="Phone code" value={phoneCode} onChangeText={setPhoneCode} keyboardType="number-pad" />
          <Pressable style={styles.button} onPress={() => call<{ accessToken: string }>('/auth/login', { method: 'POST', body: { email, password } }).then((data) => persist(data.accessToken)).then(() => setScreen('home')).catch((error: Error) => setMessage(error.message))}><Text style={styles.buttonText}>Sign in</Text></Pressable>
          <Pressable style={styles.secondary} onPress={() => call<{ preview?: { email?: string; phone?: string } }>('/auth/challenges', { method: 'POST', body: { email, phone } }).then((data) => { if (data.preview?.email) setEmailCode(data.preview.email); if (data.preview?.phone) setPhoneCode(data.preview.phone); setMessage(data.preview ? 'Codes are shown because no email or SMS provider is connected. Create the account next.' : 'Codes sent. Enter them, then create the account.'); }).catch((error: Error) => setMessage(error.message))}><Text>Send codes</Text></Pressable>
          <Pressable style={styles.secondary} onPress={() => call<{ accessToken: string }>('/auth/register', { method: 'POST', body: { email, password, displayName: name || 'Ninted member', phone, emailCode, phoneCode } }).then((data) => persist(data.accessToken)).then(() => setScreen('home')).catch((error: Error) => setMessage(error.message))}><Text>Create account</Text></Pressable>
        </View>
      ) : null}
      {screen === 'cart' ? (
        <View style={styles.list}>
          {cart.map((item) => <Text key={item.product.id}>{item.product.title} × {item.quantity}</Text>)}
          {!cart.length ? <Text style={styles.muted}>Basket is empty.</Text> : null}
          <Text style={styles.muted}>Checkout on the web or continue here once a delivery address is saved through the API. Fees are calculated by the same backend.</Text>
        </View>
      ) : null}
      {screen === 'orders' ? (
        <View style={styles.list}>
          {orders.map((order) => <Text key={order.id}>{order.status} · {formatNaira(order.buyerTotalKobo)}</Text>)}
        </View>
      ) : null}
      {screen === 'account' ? (
        <View style={styles.list}>
          <Pressable onPress={() => token && call<{ orders: typeof orders }>('/orders', { token }).then((data) => { setOrders(data.orders); setScreen('orders'); })}><Text style={styles.link}>Orders</Text></Pressable>
          <Pressable onPress={() => { SecureStore.deleteItemAsync('n9.access'); setToken(null); setScreen('home'); }}><Text style={styles.link}>Sign out</Text></Pressable>
          <Text style={styles.muted}>Android, iOS and iPad use this one client and the same API as the website.</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f4f0e6' },
  header: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  brand: { fontSize: 28, color: '#12382c', flex: 1 },
  em: { fontStyle: 'italic', color: '#1f7a45' },
  link: { color: '#12382c', fontSize: 16 },
  list: { padding: 16, gap: 12 },
  card: { backgroundColor: '#fffdf8', borderRadius: 20, padding: 12, marginBottom: 12 },
  swatch: { height: 160, borderRadius: 16, backgroundColor: '#1f7a45', marginBottom: 8 },
  title: { fontSize: 22, color: '#17241e' },
  price: { fontSize: 18, color: '#12382c' },
  muted: { color: '#5c6b64' },
  error: { color: '#8d2d2d', paddingHorizontal: 16 },
  input: { backgroundColor: 'white', borderRadius: 12, padding: 12 },
  button: { backgroundColor: '#12382c', borderRadius: 999, padding: 14, alignItems: 'center' },
  buttonText: { color: 'white' },
  secondary: { alignItems: 'center', padding: 12 },
});
