export type Transaction= {
  date:string;
  customer:string;
  item:string;
  amount:number;
};export const transactions:Transaction[]= [
  {
    date:"2026-01-10",
    customer:"미래모터스",
    item:"브레이크 센서",
    amount:15000000,
  },
  {
    date:"2026-02-12",
    customer:"미래모터스",
    item:"브레이크 센서",
    amount:16000000,
  },
  {
    date:"2026-03-05",
    customer:"새봄테크",
    item:"온도 센서",
    amount:10000000,
  },
  {
    date:"2026-04-02",
    customer:"미래모터스",
    item:"브레이크 센서",
    amount:14000000,
  },
  {
    date:"2026-04-15",
    customer:"새봄테크",
    item:"온도 센서",
    amount:11000000,
  },
  {
    date:"2026-05-03",
    customer:"한울부품",
    item:"압력 센서",
    amount:8000000,
  },
  {
    date:"2026-05-20",
    customer:"한울부품",
    item:"압력 센서",
    amount:9000000,
  },
  {
    date:"2026-06-01",
    customer:"다온산업",
    item:"제어 모듈",
    amount:7000000,
  },
  {
    date:"2026-06-14",
    customer:"다온산업",
    item:"제어 모듈",
    amount:8000000,
  },
  {
    date:"2026-06-25",
    customer:"푸른정밀",
    item:"시험 부품",
    amount:2000000,
  },
];