import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/auth.js';
import { readEnv } from '../src/env.js';

const env = readEnv();
const prisma = new PrismaClient({ datasourceUrl: env.databaseUrl });

const tree: { slug: string; name: string; children: { slug: string; name: string }[] }[] = [
  { slug: 'women', name: 'Women', children: [{ slug: 'women-dresses', name: 'Dresses' }, { slug: 'women-tops', name: 'Tops' }] },
  { slug: 'men', name: 'Men', children: [{ slug: 'men-shirts', name: 'Shirts' }, { slug: 'men-trousers', name: 'Trousers' }] },
  { slug: 'shoes', name: 'Shoes', children: [{ slug: 'sneakers', name: 'Sneakers' }, { slug: 'loafers', name: 'Loafers' }] },
  { slug: 'phones', name: 'Phones', children: [{ slug: 'smartphones', name: 'Smartphones' }] },
  { slug: 'beauty', name: 'Beauty', children: [{ slug: 'skincare', name: 'Skincare' }] },
  { slug: 'home', name: 'Home', children: [{ slug: 'decor', name: 'Decor' }] },
];

async function main() {
  for (const [index, category] of tree.entries()) {
    const parent = await prisma.category.upsert({
      where: { slug: category.slug },
      create: { slug: category.slug, name: category.name, sortOrder: index },
      update: { name: category.name, sortOrder: index },
    });
    for (const child of category.children) {
      await prisma.category.upsert({
        where: { slug: child.slug },
        create: { slug: child.slug, name: child.name, parentId: parent.id },
        update: { name: child.name, parentId: parent.id },
      });
    }
  }

  const policies = [
    {
      slug: 'buyer-protection',
      title: 'Buyer protection',
      body: 'Draft for the project owner and Nigerian counsel to approve before production.\n\nA buyer protection charge, when the owner sets one, is a platform fee snapshotted onto the order. It is not an insurance policy and it is not provider escrow.\n\nIf an item is not as described, damaged, wrong, incomplete or suspected to be counterfeit, the buyer can open a return. A refund is sent only after review and only when the payment provider accepts it.',
    },
    {
      slug: 'returns',
      title: 'Returns',
      body: 'Draft for counsel review against the Federal Competition and Consumer Protection Act and other applicable Nigerian rules.\n\nBuyers can request a return for: item not as described, wrong item, damaged item, missing components, suspected counterfeit, or another reason the owner approves.\n\nThe seller responds, an administrator reviews evidence, and logistics can arrange a return pickup when a courier or rider is actually booked. Refunds are not marked complete until the payment provider confirms them.',
    },
    {
      slug: 'privacy',
      title: 'Privacy',
      body: 'Draft for a Nigeria Data Protection Act review.\n\nNinted 9ja stores account data, listing content, order records and the last four digits of identity or bank numbers where a check is required. Full card numbers are not stored. Payment pages are hosted by the selected provider.\n\nAccess is limited by role. Privileged staff must use multi-factor authentication. Commercial changes and moderation decisions are written to the audit log.',
    },
  ];
  for (const policy of policies) {
    await prisma.platformPolicy.upsert({ where: { slug: policy.slug }, create: policy, update: policy });
  }
  for (const term of ['firearm', 'ammunition', 'cocaine', 'heroin', 'fentanyl']) {
    await prisma.prohibitedTerm.upsert({ where: { term }, create: { term, note: 'Blocked for manual review' }, update: {} });
  }

  if (process.env.SEED_ADMIN_EMAIL && process.env.SEED_ADMIN_PASSWORD) {
    const email = process.env.SEED_ADMIN_EMAIL.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      await prisma.user.create({
        data: {
          email,
          displayName: 'Platform owner',
          passwordHash: await hashPassword(process.env.SEED_ADMIN_PASSWORD),
          roles: { create: { role: 'SUPER_ADMIN' } },
        },
      });
      console.log(`Created super admin ${email}. Turn on multi-factor authentication before using admin tools.`);
    }
  }

  if (process.env.SEED_DEMO === 'true') {
    if (!process.env.SEED_DEMO_PASSWORD) throw new Error('SEED_DEMO_PASSWORD is required when SEED_DEMO=true');
    const email = 'ada@ninted.test';
    let seller = await prisma.user.findUnique({ where: { email } });
    if (!seller) {
      seller = await prisma.user.create({
        data: {
          email,
          displayName: 'Ada Okafor',
          phone: '08030000001',
          passwordHash: await hashPassword(process.env.SEED_DEMO_PASSWORD),
          seller: {
            create: {
              type: 'INDIVIDUAL',
              storeName: 'Ada Closet',
              city: 'Yaba',
              state: 'Lagos',
              verification: 'VERIFIED',
              bio: 'Edited wardrobe from Lagos. Original descriptions, no marketplace copy.',
            },
          },
        },
      });
    }
    const count = await prisma.product.count({ where: { sellerId: seller.id } });
    if (count === 0) {
      const shoes = await prisma.category.findUniqueOrThrow({ where: { slug: 'loafers' } });
      const dresses = await prisma.category.findUniqueOrThrow({ where: { slug: 'women-dresses' } });
      const phones = await prisma.category.findUniqueOrThrow({ where: { slug: 'smartphones' } });
      await prisma.product.createMany({
        data: [
          { sellerId: seller.id, categoryId: dresses.id, title: 'Olive wrap dress', description: 'Cotton wrap dress, worn to two weddings, hem intact.', brand: 'Ada Atelier', size: '12', colour: 'Olive', condition: 'VERY_GOOD', priceKobo: 1850000, state: 'Lagos', city: 'Yaba', weightGrams: 420, status: 'ACTIVE' },
          { sellerId: seller.id, categoryId: shoes.id, title: 'Forest loafers', description: 'Leather loafers with light sole wear. Size 41.', brand: 'Northloop', size: '41', colour: 'Forest', condition: 'GOOD', priceKobo: 2400000, state: 'Lagos', city: 'Yaba', weightGrams: 900, status: 'ACTIVE' },
          { sellerId: seller.id, categoryId: phones.id, title: 'Unlocked dual-SIM phone', description: '128GB, battery health stated by the seller as good, includes cable.', brand: 'Harbour', size: '128GB', colour: 'Black', condition: 'GOOD', priceKobo: 8500000, state: 'Lagos', city: 'Yaba', weightGrams: 280, status: 'ACTIVE', featuredUntil: new Date(Date.now() + 7 * 86400000) },
        ],
      });
      console.log('Seeded demo closet for ada@ninted.test');
    }
    const frames: Record<string, string[]> = {
      'Olive wrap dress': ['/catalog/olive-dress-1.svg', '/catalog/olive-dress-2.svg'],
      'Forest loafers': ['/catalog/loafers-1.svg', '/catalog/loafers-2.svg'],
      'Unlocked dual-SIM phone': ['/catalog/phone-1.svg', '/catalog/phone-2.svg'],
    };
    const closet = await prisma.product.findMany({ where: { sellerId: seller.id }, include: { images: true } });
    for (const product of closet) {
      const urls = frames[product.title];
      if (!urls || product.images.length) continue;
      await prisma.productImage.createMany({
        data: urls.map((url, sortOrder) => ({ productId: product.id, url, sortOrder })),
      });
    }
  }

  const withoutShop = await prisma.user.findMany({ where: { seller: null } });
  for (const member of withoutShop) {
    const name = member.displayName.trim() || 'Member';
    await prisma.sellerProfile.create({
      data: { userId: member.id, type: 'INDIVIDUAL', storeName: /shop$/i.test(name) ? name : `${name}'s shop` },
    });
  }
}

main().finally(() => prisma.$disconnect());
