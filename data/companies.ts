export type Company = {
    id: string;
    name: string;
    description: string;
    region: string;
    industry: string;
    employees: number;
};

export const companies: Company[] =[{
    id: "hanbit",
    name: "한빛정밀",
    description: "가상 B2B 제조기업",
    region: "대구",
    industry: "자동차 센서 부품",
    employees: 18,
    },
];

