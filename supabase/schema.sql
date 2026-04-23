-- Enable the custom UUIDv4 generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create groups table
CREATE TABLE public.groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create group members table
CREATE TABLE public.group_members (
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (group_id, user_id)
);

-- Create expenses table
CREATE TABLE public.expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
    paid_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    description TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create expense splits table
CREATE TABLE public.expense_splits (
    expense_id UUID REFERENCES public.expenses(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    amount DECIMAL(10, 2) NOT NULL CHECK (amount > 0),
    PRIMARY KEY (expense_id, user_id)
);

-- Row Level Security (RLS) Setup
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_splits ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Groups: Users can view groups they are a member of
CREATE POLICY "Users can view their groups" ON public.groups
    FOR SELECT USING (
        id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
    );

-- Groups: Any authenticated user can create a group
CREATE POLICY "Users can create groups" ON public.groups
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Group Members: Users can see members of their groups
CREATE POLICY "Users can view members of their groups" ON public.group_members
    FOR SELECT USING (
        group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
    );

-- Group Members: Users can add themselves or others to groups they are part of
CREATE POLICY "Users can add group members" ON public.group_members
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Expenses: Users can view expenses in their groups
CREATE POLICY "Users can view expenses in their groups" ON public.expenses
    FOR SELECT USING (
        group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
    );

-- Expenses: Users can insert expenses in their groups
CREATE POLICY "Users can insert expenses" ON public.expenses
    FOR INSERT WITH CHECK (
        group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid())
    );

-- Expense splits: Users can view splits for expenses in their groups
CREATE POLICY "Users can view expense splits" ON public.expense_splits
    FOR SELECT USING (
        expense_id IN (SELECT id FROM public.expenses WHERE group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid()))
    );

-- Expense splits: Users can insert splits for expenses in their groups
CREATE POLICY "Users can insert expense splits" ON public.expense_splits
    FOR INSERT WITH CHECK (
        expense_id IN (SELECT id FROM public.expenses WHERE group_id IN (SELECT group_id FROM public.group_members WHERE user_id = auth.uid()))
    );
