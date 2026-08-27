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
            topCustomerConcentration: 0,
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

// 긍정/주의 판단 기준.
const REPEAT_CAUTION = 50; // 재구매율이 이 값 미만이면 반복 거래가 약하다고 본다.
const CONCENTRATION_CAUTION = 40; // 집중도가 이 값 이상이면 특정 거래처 의존 위험으로 본다.

export type SignalTone = "positive" | "caution";

export function calculateSignals(items: Transaction[],){
    const growth = calculateCustomerGrowthRate(items);
    const top = calculateTopCustomerConcentration(items);
    const repeatPurchaseRate = calculateRepeatPurchaseRate(items);

    return {
        customerCount: countCustomers(items),
        previousCustomersCount: growth.previousCount,
        // 증가율은 "이전 기간 거래처 수"와 "최근 기간 거래처 수"를 비교해서 나온다.
        // customerCount(전체 기간 고유 거래처 수)와는 다른 값이다. 화면이
        // "이전 N곳 -> 현재 M곳"에 customerCount를 쓰는 바람에, 증가율 0%인데
        // "2곳 -> 3곳"으로 표시되는 모순이 있었다.
        recentCustomersCount: growth.recentCount,
        customerGrowthRate: growth.growthRate,
        repeatPurchaseRate,
        topCustomerConcentration: top.topCustomerConcentration,
        topCustomerName: top.topCustomerName,

        // 기업마다 값이 다르므로 긍정/주의도 값에서 판단한다.
        // (화면에서 "긍정"을 하드코딩하면 다른 기업에서 틀린 표시가 된다.)
        statuses: {
            customerGrowthRate: (
                growth.growthRate > 0 ? "positive" : "caution"
            ) as SignalTone,
            repeatPurchaseRate: (
                repeatPurchaseRate >= REPEAT_CAUTION ? "positive" : "caution"
            ) as SignalTone,
            topCustomerConcentration: (
                top.topCustomerConcentration >= CONCENTRATION_CAUTION
                    ? "caution"
                    : "positive"
            ) as SignalTone,
        },
    };
}

export type Signals = ReturnType<typeof calculateSignals>;
