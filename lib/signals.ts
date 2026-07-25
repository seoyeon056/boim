import {Transaction }from "@/data/transactions"; 

export function countCustomers(items:Transaction[],):number
{const customerNames = new Set(items.map((item) => item.customer),);
    return customerNames.size;
}

export function calculateCustomerGrowthRate(items: Transaction[],) 
    {const previousTransactions = items.filter(
    (item) => {const month = Number(item.date.slice(5,7),);
    return month<=3;    
    },); 
    const recentTransactions = items.filter((item) => {const month = Number(item.date.slice(5,7),);
    return month>=4;},);
    const previousCount = countCustomers(previousTransactions,);
    const recentCount = countCustomers(recentTransactions, );
    const growthRate = previousCount ===0?0:((recentCount-previousCount)/previousCount)*100;
    return{
        previousCount,
        recentCount,
        growthRate: Number(growthRate.toFixed(1),),
    };
}

export function calculateRepeatPurchaseRate(items: Transaction[],): number
    {const counts = new Map<string,number>();
    for (const item of items){
        const previousCount = counts.get(item.customer)??0;
        counts.set(item.customer,previousCount +1,);
    }
    const totalCustomers = counts.size;
    if (totalCustomers == 0){
        return 0;
    }
    const repeatCustomers = Array.from(counts.values(),).filter((count) => count>=2).length;
    const repeatPurchaseRate = (repeatCustomers/totalCustomers)*100;
    return Number(repeatPurchaseRate.toFixed(1),);
}

export function calculateTopCustomerConcentration(items: Transaction[], ){
    const salesByCustomer = new Map<string, number>();
    for (const item of items){
        const previousAmount = salesByCustomer.get(item.customer)??0;
        salesByCustomer.set(item.customer, previousAmount+item.amount, );
    }
    const totalSales =Array.from(salesByCustomer.values(),).reduce((sum,amount) => sum+amount,0,);
    if (totalSales === 0){
        return{
            topCustomerName: null,
            topCustomerConcentrate: 0,
        };
    }
    let topCustomerName: string|null = null;
    let topCustomerAmount = 0;
    for (const [customerName, amount] of salesByCustomer){
        if (amount > topCustomerAmount) {
            topCustomerName = customerName;
            topCustomerAmount = amount; 
        }
    }
    const concentration = (topCustomerAmount/totalSales)*100;
    return{
        topCustomerName,

        topCustomerConcentration: Number(concentration.toFixed(1),),
    };
}

export function calculateSignals(items: Transaction[],){
    const growth = calculateCustomerGrowthRate(items);
    const top = calculateTopCustomerConcentration(items);
    return {
        customerCount: countCustomers(items),
        previousCustomersCount: growth.previousCount,
        customerGrowthRate: growth.growthRate,
        repeatPurchaseRate: growth.growthRate, 
        topCustomerConcentration: top.topCustomerConcentration,
        topCustomerName: top.topCustomerName,

        statuses: {
            customerGrowthRate: "positive",
            repeatPurchaseRate: "positive",
            topCustomerConcentration: "cuation",
        },
    };
}

