const ORDER_TYPES = [
    { name: "Super Burger", prepTime: 5000, price: 50, resources: ["Knife", "Stove"] },
    { name: "Garden Salad", prepTime: 3000, price: 30, resources: ["Knife"] },
    { name: "Pasta Deluxe", prepTime: 7000, price: 80, resources: ["Stove"] },
    { name: "Mega Pizza", prepTime: 8500, price: 100, resources: ["Stove", "Knife"] },
    { name: "Sushi Platter", prepTime: 6500, price: 120, resources: ["Knife"] }
];

const STATES = {
    READY: "READY",
    WAITING: "STALLED",
    COOKING: "COOKING",
    SERVED: "SERVED"
};

class KitchenGate {
    constructor(capacity, icon) {
        this.count = capacity;
        this.max = capacity;
        this.icon = icon;
        this.queue = [];
    }

    async acquire(orderId) {
        if (this.count > 0) {
            this.count--;
            return true;
        } else {
            return new Promise(resolve => {
                this.queue.push({ resolve, orderId });
            });
        }
    }

    cancel(orderId) {
        const index = this.queue.findIndex(q => q.orderId === orderId);
        if (index !== -1) {
            this.queue.splice(index, 1);
            return true;
        }
        return false;
    }

    release() {
        if (this.queue.length > 0) {
            const { resolve } = this.queue.shift();
            resolve(true);
        } else {
            this.count++;
        }
    }
}

class KitchenManager {
    constructor() {
        this.orders = [];
        this.resources = {
            Chef: new KitchenGate(3),
            Stove: new KitchenGate(1, '🍳'),
            Knife: new KitchenGate(1, '🔪')
        };
        this.cash = 0;
        this.servedCount = 0;
        this.isAutoMode = false;

        this.init();
    }

    init() {
        document.getElementById('btn-add-order').addEventListener('click', () => this.addOrder());
        document.getElementById('btn-deadlock').addEventListener('click', () => this.triggerChaos());
        document.getElementById('btn-auto').addEventListener('click', () => this.toggleAuto());
        document.getElementById('btn-reset').addEventListener('click', () => location.reload());

        setInterval(() => this.updateUI(), 200);
        this.addLog("Kitchen is open for business!", "important");
    }

    addLog(msg, type = '') {
        const log = document.getElementById('event-log');
        const entry = document.createElement('div');
        entry.className = `log-line ${type}`;
        entry.textContent = `• ${msg}`;
        log.prepend(entry);
    }

    addOrder() {
        const type = ORDER_TYPES[Math.floor(Math.random() * ORDER_TYPES.length)];
        const isVip = Math.random() < 0.2;
        const o = {
            id: Math.floor(Math.random() * 900) + 100,
            name: type.name,
            prepTime: type.prepTime,
            price: isVip ? type.price * 2 : type.price,
            resources: [...type.resources],
            isVip: isVip,
            state: STATES.READY,
            held: [],
            chefIndex: null,
            jammed: false,
            createdAt: Date.now()
        };
        this.orders.push(o);
        this.addLog(`New order: ${o.name}${o.isVip ? ' (VIP!)' : ''}`);
        this.renderQueue();
    }

    renderQueue() {
        const list = document.getElementById('queue-list');
        list.innerHTML = '';

        const ready = this.orders.filter(o => o.state === STATES.READY)
            .sort((a, b) => (b.isVip ? 1 : 0) - (a.isVip ? 1 : 0) || a.createdAt - b.createdAt);

        if (ready.length === 0) {
            list.innerHTML = '<div style="text-align:center; color:#94a3b8; margin-top:20px;">No pending orders</div>';
            return;
        }

        ready.forEach(o => {
            const ticket = document.createElement('div');
            ticket.className = `order-ticket ${o.isVip ? 'vip' : ''}`;
            ticket.innerHTML = `
                <h4>#${o.id} ${o.name}</h4>
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span class="ticket-status ready">READY</span>
                    <span style="font-weight:700; color:var(--primary-green)">$${o.price}</span>
                </div>
            `;
            ticket.onclick = () => this.dispatchOrder(o);
            list.appendChild(ticket);
        });
    }

    async dispatchOrder(o) {
        if (o.state !== STATES.READY) return;

        o.state = STATES.WAITING;
        this.addLog(`Order #${o.id} sent to the kitchen.`);
        this.renderQueue();

        await this.resources.Chef.acquire(o.id);
        const busySlots = this.orders.filter(item => item.chefIndex !== null).map(item => item.chefIndex);
        o.chefIndex = [0, 1, 2].find(idx => !busySlots.includes(idx));

        this.addLog(`Chef assigned to #${o.id}. Gathering tools...`);
        this.updateUI();

        try {
            for (const resName of o.resources) {
                const acquired = await Promise.race([
                    this.resources[resName].acquire(o.id),
                    new Promise((_, reject) => setTimeout(() => reject('jam'), 10000))
                ]);

                if (acquired) {
                    o.held.push(resName);
                    this.addLog(`#${o.id} picked up the ${resName}.`);
                }
            }

            o.state = STATES.COOKING;
            o.startTime = Date.now();
            this.addLog(`Station #${o.id} is cooking!`, "important");

            await new Promise(r => setTimeout(r, o.prepTime));
            this.serve(o);

        } catch (err) {
            if (err === 'jam') {
                o.jammed = true;
                this.addLog(`STATION JAM on #${o.id}! Resetting station...`, "danger");
                this.updateUI();
                await new Promise(r => setTimeout(r, 1500));

                o.resources.forEach(resName => {
                    const wasCancelled = this.resources[resName].cancel(o.id);
                    if (!wasCancelled && !o.held.includes(resName)) o.held.push(resName);
                });

                this.cleanup(o);
                o.state = STATES.READY;
                this.renderQueue();
                if (this.isAutoMode) this.autoScheduler();
            }
        }
    }

    cleanup(o) {
        while (o.held.length > 0) this.resources[o.held.pop()].release();
        if (o.chefIndex !== null) {
            this.resources.Chef.release();
            o.chefIndex = null;
        }
        o.jammed = false;
    }

    serve(o) {
        this.cleanup(o);
        o.state = STATES.SERVED;
        this.cash += o.price;
        this.servedCount++;
        this.addLog(`Order #${o.id} served! Earned $${o.price}`, "important");
        this.showMoney(o.price);

        setTimeout(() => {
            this.orders = this.orders.filter(item => item !== o);
        }, 1500);

        if (this.isAutoMode) this.autoScheduler();
    }

    showMoney(amt) {
        const pop = document.createElement('div');
        pop.textContent = `+$${amt}`;
        pop.style.cssText = `position:fixed; left:50%; top:40%; color:#22c55e; font-weight:800; font-size:2rem; pointer-events:none; z-index:9999; animation: floatUp 0.8s forwards;`;
        document.body.appendChild(pop);
        setTimeout(() => pop.remove(), 800);
    }

    updateUI() {
        document.getElementById('stat-cash').textContent = `$${this.cash}`;
        const active = this.orders.filter(o => o.state !== STATES.READY).length;
        document.getElementById('stat-rating').textContent = "⭐⭐⭐⭐⭐";
        document.getElementById('stat-heat').textContent = active > 2 ? "BUSY" : (active > 0 ? "ACTIVE" : "IDLE");

        const resMon = document.getElementById('resource-monitors');
        resMon.innerHTML = '';
        ['Stove', 'Knife'].forEach(key => {
            const r = this.resources[key];
            const div = document.createElement('div');
            div.className = 'resource-badge';
            div.innerHTML = `<span>${r.icon}</span>`;
            for (let i = 0; i < r.max; i++) {
                const dot = document.createElement('div');
                dot.className = `res-dot ${i < (r.max - r.count) ? 'active' : ''}`;
                div.appendChild(dot);
            }
            resMon.appendChild(div);
        });

        const grid = document.getElementById('kitchen-slots');
        grid.innerHTML = '';
        for (let i = 0; i < 3; i++) {
            const order = this.orders.find(o => o.chefIndex === i);
            const slot = document.createElement('div');
            slot.className = `chef-seat ${order ? 'occupied' : ''} ${order?.jammed ? 'shake' : ''}`;

            if (order) {
                const progress = order.state === STATES.COOKING
                    ? Math.min(100, (Date.now() - order.startTime) / order.prepTime * 100)
                    : 0;
                slot.innerHTML = `
                    <div style="width:100%">
                        <div style="font-weight:800; font-size:0.85rem;">${order.name}</div>
                        <div style="font-size:0.75rem; color:var(--text-muted)">#${order.id}</div>
                        <div class="p-bar-container">
                            <div class="p-bar-fill" style="width:${progress}%; background:${order.jammed ? 'var(--primary-red)' : ''}"></div>
                        </div>
                        <div style="font-size:0.7rem; color:var(--primary-orange); margin-top:4px; font-weight:700;">${order.state}...</div>
                    </div>
                `;
            } else {
                slot.innerHTML = `<span>Station Idle</span>`;
            }
            grid.appendChild(slot);
        }
    }

    toggleAuto() {
        this.isAutoMode = !this.isAutoMode;
        const btn = document.getElementById('btn-auto');
        btn.textContent = this.isAutoMode ? "Assistant: On" : "Assistant: Off";
        btn.style.background = this.isAutoMode ? "var(--primary-orange)" : "var(--primary-green)";
        if (this.isAutoMode) this.autoScheduler();
    }

    autoScheduler() {
        if (!this.isAutoMode) return;
        const next = this.orders.find(o => o.state === STATES.READY);
        if (next && this.resources.Chef.count > 0) this.dispatchOrder(next);
    }

    triggerChaos() {
        this.addLog("CHAOS RUSH HOUR!", "danger");
        this.orders = this.orders.filter(o => o.state !== STATES.READY);
        const t = Date.now();
        const oA = { ...ORDER_TYPES[3], id: 998, name: "Conflict Burger-A", state: STATES.READY, resources: ["Stove", "Knife"], held: [], chefIndex: null, jammed: false, createdAt: t };
        const oB = { ...ORDER_TYPES[3], id: 999, name: "Conflict Burger-B", state: STATES.READY, resources: ["Knife", "Stove"], held: [], chefIndex: null, jammed: false, createdAt: t + 1 };
        this.orders.push(oA, oB);
        this.renderQueue();
        setTimeout(() => this.dispatchOrder(oA), 10);
        setTimeout(() => this.dispatchOrder(oB), 200);
    }
}

const style = document.createElement('style');
style.textContent = `
@keyframes floatUp {
    0% { transform: translate(-50%, 0); opacity: 1; }
    100% { transform: translate(-50%, -60px); opacity: 0; }
}
`;
document.head.appendChild(style);

window.kitchenManager = new KitchenManager();
