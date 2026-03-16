ALTER TABLE rs_partners ADD COLUMN vat_type varchar NOT NULL DEFAULT 'standard';

UPDATE rs_partners SET vat_type = 'vat_separate' WHERE id IN (
  '9a7adf7d-716d-4171-8442-6d7e3717778a',  -- 문피아
  'ea391883-efe8-4204-ac83-7ec2e87fcf66',  -- 김영한(박산)
  '9facaeca-c82e-4332-ada8-ba7392360bed',  -- 황혜순(리브바이)
  '644217c3-9a96-4e44-b4f1-2de43afbb6a7',  -- 강호룡(비가)
  'deeb8c06-1f91-4686-942f-b4d4aa192c61',  -- 김태완(파셔)
  '11ea690a-8bd8-459b-b424-4b5984a9674e',  -- 이광연(이달아)
  'fdaf7923-4a47-4a25-a8a7-f5f01b593318'   -- 박선민(승하)
);
